import { describe, expect, test } from 'bun:test'
import { createSettingsStore } from '@/domain/settings/createSettingsStore'
import { createSiteStore } from '@/domain/sites/createSiteStore'
import { createTranslationService } from '@/domain/translation/createTranslationService'
import { createUsageStore } from '@/domain/usage/createUsageStore'
import { createExtensionRouter } from './createExtensionRouter'

function router(notified: string[] = []) {
  let stored: unknown
  let sitesStored: unknown
  const settings = createSettingsStore({
    read: async () => stored,
    write: async (value) => {
      stored = value
    },
  })
  const usage = createUsageStore({
    read: async () => undefined,
    write: async () => undefined,
    version: 'test',
  })

  const sites = createSiteStore({
    read: async () => sitesStored,
    write: async (value) => {
      sitesStored = value
    },
  })

  return createExtensionRouter({
    settings,
    usage,
    sites,
    notifySiteHidden: (site) => notified.push(site),
    recordUsage: () => undefined,
    managedAzureUrl: Promise.resolve(undefined),
    translator: Promise.resolve(
      createTranslationService({ readSettings: settings.settings })
    ),
    openSettings: async () => undefined,
  })
}

const contentScript = { extension: true, settingsPage: false }
const settingsPage = { extension: true, settingsPage: true }

describe('extension messages', () => {
  test('a content script cannot read settings, keys, usage, or diagnostics', async () => {
    const handle = router()

    for (const kind of [
      'hidden-sites',
      'show-site',
      'get-settings',
      'save-settings',
      'test-connection',
      'get-usage',
      'export-diagnostics',
      'check-deepl-usage',
    ]) {
      expect(await handle({ kind }, contentScript)).toEqual({
        ok: false,
        message: 'Open the extension settings to change API keys.',
      })
    }
  })

  test('the settings page can read settings and usage', async () => {
    const handle = router()

    expect(await handle({ kind: 'get-settings' }, settingsPage)).toMatchObject({
      ok: true,
      data: { managedAzureAvailable: false },
    })
    expect(await handle({ kind: 'get-usage' }, settingsPage)).toMatchObject({
      ok: true,
      data: { days: [] },
    })
  })

  test('messages from outside the extension and unknown kinds are rejected', async () => {
    const handle = router()

    expect(
      await handle(
        { kind: 'preferences' },
        { extension: false, settingsPage: false }
      )
    ).toMatchObject({ ok: false, message: 'Invalid extension request.' })
    expect(await handle({ kind: 'toString' }, settingsPage)).toMatchObject({
      ok: false,
      message: 'Unknown extension request.',
    })
  })

  test('translation errors keep their category for the popup', async () => {
    const handle = router()

    expect(
      await handle(
        { kind: 'translate', text: 'Hi', target: 'uk' },
        contentScript
      )
    ).toMatchObject({ ok: false, code: 'configuration' })
  })
})

describe('hidden sites', () => {
  test('a content script can check its site and hide it, and other tabs are told', async () => {
    const notified: string[] = []
    const handle = router(notified)

    expect(
      await handle(
        { kind: 'site-status', site: 'www.Example.com' },
        contentScript
      )
    ).toEqual({ ok: true, data: { hidden: false } })
    expect(
      await handle({ kind: 'hide-site', site: 'example.com' }, contentScript)
    ).toEqual({ ok: true, data: { hidden: true } })
    expect(notified).toEqual(['example.com'])
    expect(
      await handle({ kind: 'site-status', site: 'example.com' }, contentScript)
    ).toEqual({ ok: true, data: { hidden: true } })
  })

  test('the settings page lists hidden sites and shows one again', async () => {
    const handle = router()
    await handle({ kind: 'hide-site', site: 'b.example' }, contentScript)
    await handle({ kind: 'hide-site', site: 'a.example' }, contentScript)

    expect(await handle({ kind: 'hidden-sites' }, settingsPage)).toEqual({
      ok: true,
      data: ['a.example', 'b.example'],
    })
    expect(
      await handle({ kind: 'show-site', site: 'a.example' }, settingsPage)
    ).toEqual({ ok: true, data: ['b.example'] })
  })

  test('an invalid site is rejected and nothing is hidden', async () => {
    const notified: string[] = []
    const handle = router(notified)

    expect(
      await handle({ kind: 'hide-site', site: 'not a host' }, contentScript)
    ).toMatchObject({ ok: false })
    expect(notified).toEqual([])
  })
})
