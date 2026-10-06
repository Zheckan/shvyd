import { expect, test } from 'bun:test'
import { createSettingsStore } from './createSettingsStore'
import { DEFAULT_SETTINGS, initialTarget } from './settings'

test('remembers the last target across restarts without exposing credentials to the popup', async () => {
  let persisted: unknown
  const storage = {
    read: async () => persisted,
    write: async (value: unknown) => {
      persisted = structuredClone(value)
    },
    seed: async () => ({
      ...DEFAULT_SETTINGS,
      azure: { key: 'private-key', region: '' },
    }),
  }
  const first = createSettingsStore(storage)
  expect(await first.preferences()).toMatchObject({
    target: 'uk',
    provider: 'azure',
    adaptToPage: true,
  })
  await first.updatePreferences({ target: 'pl' })
  const restarted = createSettingsStore(storage)
  expect(await restarted.preferences()).toMatchObject({
    target: 'pl',
    provider: 'azure',
    adaptToPage: true,
  })
  expect((await restarted.settings()).azure.key).toBe('private-key')
})

test('keeps a fixed default separate from the remembered language across restarts', async () => {
  let persisted: unknown = structuredClone(DEFAULT_SETTINGS)
  const storage = {
    read: async () => persisted,
    write: async (value: unknown) => {
      persisted = structuredClone(value)
    },
    seed: async () => structuredClone(DEFAULT_SETTINGS),
  }
  const store = createSettingsStore(storage)
  await store.updatePreferences({
    target: 'pl',
    targetMode: 'fixed',
    defaultTarget: 'uk',
  })
  const restarted = createSettingsStore(storage)
  const fixed = await restarted.preferences()
  expect(initialTarget(fixed)).toBe('uk')
  expect(fixed.target).toBe('pl')
  expect(
    initialTarget(await restarted.updatePreferences({ targetMode: 'last' }))
  ).toBe('pl')
})

test('loads old settings with language defaults while preserving the previous target', async () => {
  const store = createSettingsStore({
    read: async () => ({
      provider: 'azure',
      target: 'de',
      adaptToPage: false,
      azure: { key: 'existing-key', region: '' },
      deepl: { key: '', endpoint: 'https://api-free.deepl.com' },
    }),
    write: async () => {},
    seed: async () => structuredClone(DEFAULT_SETTINGS),
  })
  expect(await store.preferences()).toMatchObject({
    target: 'de',
    targetMode: 'last',
    favoriteLanguages: ['uk', 'en', 'pl'],
    showOtherLanguages: true,
  })
  expect((await store.settings()).azure.key).toBe('existing-key')
})

test('uses an available preferred language after changing to a provider that lacks the target', async () => {
  const store = createSettingsStore({
    read: async () => undefined,
    write: async () => {},
    seed: async () => structuredClone(DEFAULT_SETTINGS),
  })
  await store.updatePreferences({
    provider: 'deepl',
    target: 'en-us',
    favoriteLanguages: ['en-us', 'uk'],
  })
  expect(await store.updatePreferences({ provider: 'azure' })).toMatchObject({
    target: 'uk',
    favoriteLanguages: ['en-us', 'uk'],
  })
})

test('remembers preferred languages and whether additional languages are shown', async () => {
  let persisted: unknown
  const storage = {
    read: async () => persisted,
    write: async (value: unknown) => {
      persisted = structuredClone(value)
    },
    seed: async () => structuredClone(DEFAULT_SETTINGS),
  }
  const first = createSettingsStore(storage)
  await first.updatePreferences({
    favoriteLanguages: ['uk', 'ko', 'ar'],
    showOtherLanguages: false,
  })
  const restarted = createSettingsStore(storage)
  expect(await restarted.preferences()).toMatchObject({
    favoriteLanguages: ['uk', 'ko', 'ar'],
    showOtherLanguages: false,
  })
})

test('rejects invalid preference values instead of silently keeping the old ones', async () => {
  const store = createSettingsStore({
    read: async () => structuredClone(DEFAULT_SETTINGS),
    write: async () => {},
    seed: async () => structuredClone(DEFAULT_SETTINGS),
  })
  await expect(store.updatePreferences({ target: null })).rejects.toThrow(
    'Invalid preferences.'
  )
  await expect(
    store.updatePreferences({ favoriteLanguages: [] })
  ).rejects.toThrow('Invalid preferences.')
  expect(await store.preferences()).toMatchObject({ target: 'uk' })
})
