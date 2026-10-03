import { DEFAULT_SETTINGS, isRecord } from './settings'
import { createSettingsStore } from './settings-store'
import {
  createTranslationService,
  parseTranslationRequest,
  TranslationError,
} from './translation'

const ready = chrome.storage.local.setAccessLevel({
  accessLevel: 'TRUSTED_CONTEXTS',
})
const store = createSettingsStore({
  read: async () => {
    await ready
    const result = await chrome.storage.local.get('settings')
    return result.settings
  },
  write: (settings) => chrome.storage.local.set({ settings }),
  seed: async () => {
    try {
      const response = await fetch(chrome.runtime.getURL('local-settings.json'))
      return response.ok
        ? await response.json()
        : structuredClone(DEFAULT_SETTINGS)
    } catch {
      return structuredClone(DEFAULT_SETTINGS)
    }
  },
})
const translator = createTranslationService({ readSettings: store.settings })

async function handle(
  value: unknown,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  if (sender.id !== chrome.runtime.id || !isRecord(value))
    throw new Error('Invalid extension request.')
  switch (value.kind) {
    case 'preferences':
      return store.preferences()
    case 'update-preferences':
      return store.updatePreferences(value.value)
    case 'translate':
      return translator.translate(parseTranslationRequest(value))
    case 'open-settings':
      await chrome.runtime.openOptionsPage()
      return null
    case 'get-settings':
    case 'save-settings': {
      if (
        sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('options.html')
      ) {
        throw new Error('Open the extension settings to change API keys.')
      }
      if (value.kind === 'get-settings') return store.settings()
      const settings = await store.save(value.value)
      translator.clearCache()
      return settings
    }
    default:
      throw new Error('Unknown extension request.')
  }
}

chrome.runtime.onMessage.addListener((request: unknown, sender, respond) => {
  handle(request, sender).then(
    (data) => respond({ ok: true, data }),
    (error) =>
      respond({
        ok: false,
        code: error instanceof TranslationError ? error.code : 'configuration',
        message:
          error instanceof Error
            ? error.message
            : 'Shvyd could not finish this request.',
      })
  )
  return true
})
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})
