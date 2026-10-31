import type { createSettingsStore } from '@/domain/settings/createSettingsStore'
import { isProvider, parseSettings } from '@/domain/settings/settings'
import type { createSiteStore } from '@/domain/sites/createSiteStore'
import { parseSite } from '@/domain/sites/sites'
import { checkDeepLUsage } from '@/domain/translation/checkDeepLUsage'
import type { createTranslationService } from '@/domain/translation/createTranslationService'
import { testConnection } from '@/domain/translation/testConnection'
import {
  parseTranslationRequest,
  TranslationError,
  type TranslationEvent,
} from '@/domain/translation/translation'
import type { createUsageStore } from '@/domain/usage/createUsageStore'
import { isRecord } from '@/utils/isRecord'

/** Where a message came from, as established by the browser, not the message. */
export type MessageSender = {
  /** Sent by this extension (content script or extension page). */
  extension: boolean
  /** Sent by the extension's own settings page. */
  settingsPage: boolean
}

export type ExtensionResponse =
  { ok: true; data: unknown } | { ok: false; code?: string; message: string }

type Message = Record<string, unknown>

type Route = {
  /** Settings-page routes can read or change keys, usage, and diagnostics. */
  access: 'extension' | 'settings-page'
  run: (message: Message) => unknown
}

export function createExtensionRouter({
  settings,
  usage,
  sites,
  notifySiteHidden,
  translator,
  managedAzureUrl,
  recordUsage,
  openSettings,
}: {
  settings: ReturnType<typeof createSettingsStore>
  usage: ReturnType<typeof createUsageStore>
  sites: ReturnType<typeof createSiteStore>
  /** Tells other pages on the site to remove Shvyd now, without a reload. */
  notifySiteHidden: (site: string) => void
  translator: Promise<ReturnType<typeof createTranslationService>>
  managedAzureUrl: Promise<string | undefined>
  recordUsage: (event: TranslationEvent) => void
  openSettings: () => Promise<void>
}) {
  async function changeUsage(change: Promise<void>): Promise<unknown> {
    await change
    return usage.view()
  }

  const routes: Record<string, Route> = {
    preferences: {
      access: 'extension',
      run: () => settings.preferences(),
    },
    'update-preferences': {
      access: 'extension',
      run: (message) => settings.updatePreferences(message.value),
    },
    translate: {
      access: 'extension',
      run: async (message) =>
        (await translator).translate(parseTranslationRequest(message)),
    },
    'open-settings': {
      access: 'extension',
      run: async () => {
        await openSettings()
        return null
      },
    },
    'site-status': {
      access: 'extension',
      run: async (message) => ({
        hidden: await sites.isHidden(parseSite(message.site)),
      }),
    },
    'hide-site': {
      access: 'extension',
      run: async (message) => {
        const site = parseSite(message.site)
        await sites.hide(site)
        notifySiteHidden(site)
        return { hidden: true }
      },
    },
    'hidden-sites': { access: 'settings-page', run: () => sites.list() },
    'show-site': {
      access: 'settings-page',
      run: async (message) => {
        await sites.show(parseSite(message.site))
        return sites.list()
      },
    },
    'get-settings': {
      access: 'settings-page',
      run: async () => ({
        ...(await settings.settings()),
        managedAzureAvailable: !!(await managedAzureUrl),
      }),
    },
    'save-settings': {
      access: 'settings-page',
      run: async (message) => {
        const saved = await settings.save(message.value)
        ;(await translator).clearCache()
        return saved
      },
    },
    'test-connection': {
      access: 'settings-page',
      run: async (message) => {
        if (!isProvider(message.provider)) {
          throw new Error('Choose a translation provider.')
        }

        return testConnection({
          settings: parseSettings(message.value),
          provider: message.provider,
          managedAzureUrl: await managedAzureUrl,
          onEvent: recordUsage,
        })
      },
    },
    'check-deepl-usage': {
      access: 'settings-page',
      run: async () => checkDeepLUsage({ settings: await settings.settings() }),
    },
    'get-usage': { access: 'settings-page', run: () => usage.view() },
    'clear-usage': {
      access: 'settings-page',
      run: () => changeUsage(usage.clearUsage()),
    },
    'set-diagnostics': {
      access: 'settings-page',
      run: (message) => {
        if (typeof message.enabled !== 'boolean') {
          throw new Error('Choose whether to keep error records.')
        }

        return changeUsage(usage.setDiagnostics(message.enabled))
      },
    },
    'clear-diagnostics': {
      access: 'settings-page',
      run: () => changeUsage(usage.clearDiagnostics()),
    },
    'export-diagnostics': {
      access: 'settings-page',
      run: () => usage.exportDiagnostics(),
    },
  }

  async function dispatch(
    message: unknown,
    sender: MessageSender
  ): Promise<unknown> {
    if (!sender.extension || !isRecord(message)) {
      throw new Error('Invalid extension request.')
    }

    const route = Object.hasOwn(routes, String(message.kind))
      ? routes[String(message.kind)]
      : undefined

    if (!route) {
      throw new Error('Unknown extension request.')
    }

    if (route.access === 'settings-page' && !sender.settingsPage) {
      throw new Error('Open the extension settings to change API keys.')
    }

    return route.run(message)
  }

  /** Handles one runtime message; never rejects. */
  return async function handle(
    message: unknown,
    sender: MessageSender
  ): Promise<ExtensionResponse> {
    try {
      return { ok: true, data: await dispatch(message, sender) }
    } catch (error) {
      return {
        ok: false,
        ...(error instanceof TranslationError ? { code: error.code } : {}),
        message:
          error instanceof Error
            ? error.message
            : 'Shvyd could not finish this request.',
      }
    }
  }
}
