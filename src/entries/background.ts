import { createSettingsStore } from '@/domain/settings/createSettingsStore'
import { createSiteStore } from '@/domain/sites/createSiteStore'
import { parseReleaseConfig } from '@/domain/settings/release-config'
import { createTranslationService } from '@/domain/translation/createTranslationService'
import type { TranslationEvent } from '@/domain/translation/translation'
import { createUsageStore } from '@/domain/usage/createUsageStore'
import { createExtensionRouter } from '@/features/extension-router/createExtensionRouter'

const ready = chrome.storage.local.setAccessLevel({
  accessLevel: 'TRUSTED_CONTEXTS',
})

async function readKey(key: string): Promise<unknown> {
  await ready
  const result = await chrome.storage.local.get(key)
  return result[key]
}

const settings = createSettingsStore({
  credentialMode: 'byok',
  read: () => readKey('settings'),
  write: (value) => chrome.storage.local.set({ settings: value }),
})

const usage = createUsageStore({
  read: () => readKey('usage'),
  write: (value) => chrome.storage.local.set({ usage: value }),
  version: chrome.runtime.getManifest().version,
})

const sites = createSiteStore({
  read: () => readKey('hiddenSites'),
  write: (value) => chrome.storage.local.set({ hiddenSites: value }),
})

async function notifySiteHidden(site: string): Promise<void> {
  // Every frame checks the site itself; tabs without Shvyd simply do not answer.
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) {
      chrome.tabs
        .sendMessage(tab.id, { kind: 'site-hidden', site })
        .catch(() => undefined)
    }
  }
}

function recordUsage(event: TranslationEvent): void {
  // Counters are best effort; a storage failure must not affect the translation.
  usage.record(event).catch(() => undefined)
}

const managedAzureUrl = fetch(chrome.runtime.getURL('release-config.json'))
  .then(async (response) => parseReleaseConfig(await response.json()))
  .then((config) => config.managedAzureUrl || undefined)

const handle = createExtensionRouter({
  settings,
  usage,
  sites,
  notifySiteHidden: (site) => {
    void notifySiteHidden(site).catch(() => undefined)
  },
  recordUsage,
  managedAzureUrl,
  translator: managedAzureUrl.then((url) =>
    createTranslationService({
      readSettings: settings.settings,
      managedAzureUrl: url,
      onEvent: recordUsage,
    })
  ),
  openSettings: () => chrome.runtime.openOptionsPage(),
})

const SETTINGS_PAGE = chrome.runtime.getURL('options.html')

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  void handle(message, {
    extension: sender.id === chrome.runtime.id,
    settingsPage: sender.url?.split(/[?#]/)[0] === SETTINGS_PAGE,
  }).then(respond)

  return true
})

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})
