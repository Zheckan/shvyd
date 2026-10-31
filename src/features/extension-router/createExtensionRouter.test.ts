import { describe, expect, test } from 'bun:test'
import { createSettingsStore } from '@/domain/settings/createSettingsStore'
import { createTranslationService } from '@/domain/translation/createTranslationService'
import { createUsageStore } from '@/domain/usage/createUsageStore'
import { createExtensionRouter } from './createExtensionRouter'

function router() {
  let stored: unknown
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

  return createExtensionRouter({
    settings,
    usage,
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
