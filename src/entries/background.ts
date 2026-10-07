import { createSettingsStore } from '@/domain/settings/createSettingsStore'
import {
  DEFAULT_SETTINGS,
  isProvider,
  migrateUserSettings,
  parseSettings,
} from '@/domain/settings/settings'
import { parseReleaseConfig } from '@/domain/settings/release-config'
import { testConnection } from '@/domain/translation/testConnection'
import { createTranslationService } from '@/domain/translation/createTranslationService'
import {
  parseTranslationRequest,
  TranslationError,
} from '@/domain/translation/translation'
import { isRecord } from '@/utils/isRecord'

const ready = chrome.storage.local.setAccessLevel({
  accessLevel: 'TRUSTED_CONTEXTS',
})

const store = createSettingsStore({
  read: async () => {
    await ready
    const result = await chrome.storage.local.get('settings')
    if (result.settings === undefined) {
      return undefined
    }

    const settings = migrateUserSettings(result.settings)
    await chrome.storage.local.set({
      settings: { ...settings, credentialOrigin: 'byok' },
    })

    return settings
  },
  write: (settings) =>
    chrome.storage.local.set({
      settings: { ...settings, credentialOrigin: 'byok' },
    }),
  seed: async () => structuredClone(DEFAULT_SETTINGS),
})

const config = fetch(chrome.runtime.getURL('release-config.json')).then(
  async (response) => parseReleaseConfig(await response.json())
)
const translator = config.then((value) =>
  createTranslationService({
    readSettings: store.settings,
    managedAzureUrl: value.managedAzureUrl || undefined,
  })
)

async function handle(
  value: unknown,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  if (sender.id !== chrome.runtime.id || !isRecord(value)) {
    throw new Error('Invalid extension request.')
  }

  switch (value.kind) {
    case 'preferences':
      return store.preferences()
    case 'update-preferences':
      return store.updatePreferences(value.value)
    case 'translate':
      return (await translator).translate(parseTranslationRequest(value))
    case 'open-settings':
      await chrome.runtime.openOptionsPage()
      return null
    case 'get-settings':
    case 'test-connection':
    case 'save-settings': {
      if (
        sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('options.html')
      ) {
        throw new Error('Open the extension settings to change API keys.')
      }

      if (value.kind === 'get-settings') {
        return {
          ...(await store.settings()),
          managedAzureAvailable: !!(await config).managedAzureUrl,
        }
      }

      if (value.kind === 'test-connection') {
        if (!isProvider(value.provider)) {
          throw new Error('Choose a translation provider.')
        }

        return testConnection({
          settings: parseSettings(value.value),
          provider: value.provider,
          managedAzureUrl: (await config).managedAzureUrl || undefined,
        })
      }

      const settings = await store.save(value.value)
      const service = await translator
      service.clearCache()
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
        ...(error instanceof TranslationError ? { code: error.code } : {}),
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
