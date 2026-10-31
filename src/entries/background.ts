import { createSettingsStore } from '@/domain/settings/createSettingsStore'
import { isProvider, parseSettings } from '@/domain/settings/settings'
import { parseReleaseConfig } from '@/domain/settings/release-config'
import { checkDeepLUsage } from '@/domain/translation/checkDeepLUsage'
import { testConnection } from '@/domain/translation/testConnection'
import { createTranslationService } from '@/domain/translation/createTranslationService'
import {
  parseTranslationRequest,
  TranslationError,
  type TranslationEvent,
} from '@/domain/translation/translation'
import { createUsageStore } from '@/domain/usage/createUsageStore'
import { isRecord } from '@/utils/isRecord'

const ready = chrome.storage.local.setAccessLevel({
  accessLevel: 'TRUSTED_CONTEXTS',
})

const store = createSettingsStore({
  credentialMode: 'byok',
  read: async () => {
    await ready
    const result = await chrome.storage.local.get('settings')
    return result.settings
  },
  write: (settings) => chrome.storage.local.set({ settings }),
})

const usage = createUsageStore({
  read: async () => {
    await ready
    const result = await chrome.storage.local.get('usage')
    return result.usage
  },
  write: (value) => chrome.storage.local.set({ usage: value }),
  version: chrome.runtime.getManifest().version,
})

function recordUsage(event: TranslationEvent): void {
  // Counters are best effort; a storage failure must not affect the translation.
  usage.record(event).catch(() => undefined)
}

const SETTINGS_PAGE_REQUESTS = new Set([
  'get-settings',
  'test-connection',
  'save-settings',
  'get-usage',
  'clear-usage',
  'set-diagnostics',
  'clear-diagnostics',
  'export-diagnostics',
  'check-deepl-usage',
])

const config = fetch(chrome.runtime.getURL('release-config.json')).then(
  async (response) => parseReleaseConfig(await response.json())
)
const translator = config.then((value) =>
  createTranslationService({
    readSettings: store.settings,
    managedAzureUrl: value.managedAzureUrl || undefined,
    onEvent: recordUsage,
  })
)

async function handle(
  value: unknown,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  if (sender.id !== chrome.runtime.id || !isRecord(value)) {
    throw new Error('Invalid extension request.')
  }

  if (
    SETTINGS_PAGE_REQUESTS.has(String(value.kind)) &&
    sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('options.html')
  ) {
    throw new Error('Open the extension settings to change API keys.')
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
      return {
        ...(await store.settings()),
        managedAzureAvailable: !!(await config).managedAzureUrl,
      }
    case 'test-connection':
      if (!isProvider(value.provider)) {
        throw new Error('Choose a translation provider.')
      }

      return testConnection({
        settings: parseSettings(value.value),
        provider: value.provider,
        managedAzureUrl: (await config).managedAzureUrl || undefined,
        onEvent: recordUsage,
      })
    case 'save-settings': {
      const settings = await store.save(value.value)
      const service = await translator
      service.clearCache()
      return settings
    }
    case 'get-usage':
      return usage.view()
    case 'clear-usage':
      await usage.clearUsage()
      return usage.view()
    case 'set-diagnostics':
      if (typeof value.enabled !== 'boolean') {
        throw new Error('Choose whether to keep error records.')
      }

      await usage.setDiagnostics(value.enabled)
      return usage.view()
    case 'clear-diagnostics':
      await usage.clearDiagnostics()
      return usage.view()
    case 'export-diagnostics':
      return usage.exportDiagnostics()
    case 'check-deepl-usage':
      return checkDeepLUsage({ settings: await store.settings() })
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
