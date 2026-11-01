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
    seed: async () => ({
      ...structuredClone(DEFAULT_SETTINGS),
      deepl: { key: 'user-key', endpoint: 'https://api-free.deepl.com' },
    }),
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

test('BYOK storage removes legacy owner credentials but retains preferences and new user keys across restarts', async () => {
  let persisted: unknown = {
    ...structuredClone(DEFAULT_SETTINGS),
    target: 'pl',
    azure: { key: 'owner-bootstrap-azure', region: '' },
    deepl: {
      key: 'owner-bootstrap-deepl',
      endpoint: 'https://api-free.deepl.com',
    },
  }
  const storage = {
    credentialMode: 'byok' as const,
    read: async () => persisted,
    write: async (value: unknown) => {
      persisted = structuredClone(value)
    },
    seed: async () => ({
      ...DEFAULT_SETTINGS,
      azure: { key: 'owner-seed-key', region: '' },
    }),
  }
  const first = createSettingsStore(storage)
  expect(await first.settings()).toMatchObject({
    target: 'pl',
    azure: { key: '' },
    deepl: { key: '' },
  })
  expect(JSON.stringify(persisted)).not.toContain('owner-bootstrap')
  await first.save({
    ...(await first.settings()),
    azure: { key: 'user-key', region: '' },
  })
  const restarted = createSettingsStore(storage)
  expect((await restarted.settings()).azure.key).toBe('user-key')
  expect(await restarted.preferences()).not.toHaveProperty('azure')
  persisted = undefined
  const fresh = createSettingsStore(storage)
  expect((await fresh.settings()).azure.key).toBe('')
})

test('DeepL can only be selected with BYOK and removing its key restores Azure', async () => {
  const store = createSettingsStore({
    credentialMode: 'byok',
    read: async () => undefined,
    write: async () => {},
  })
  expect(await store.updatePreferences({ provider: 'deepl' })).toMatchObject({
    provider: 'azure',
  })
  const own = {
    ...(await store.settings()),
    provider: 'deepl',
    deepl: { key: 'user-deepl', endpoint: 'https://api-free.deepl.com' },
  }
  expect(await store.save(own)).toMatchObject({ provider: 'deepl' })
  expect(
    await store.save({ ...own, deepl: { ...own.deepl, key: '' } })
  ).toMatchObject({ provider: 'azure' })
})

test('the popup appears next to the cursor by default, and the choice is saved', async () => {
  const { popupAnchor: _removed, ...older } = DEFAULT_SETTINGS
  let persisted: unknown = structuredClone(older)
  const storage = {
    read: async () => persisted,
    write: async (value: unknown) => {
      persisted = structuredClone(value)
    },
  }

  const store = createSettingsStore(storage)
  expect((await store.preferences()).popupAnchor).toBe('cursor')

  await store.updatePreferences({ popupAnchor: 'selection' })
  expect((await createSettingsStore(storage).preferences()).popupAnchor).toBe(
    'selection'
  )
  await expect(
    store.updatePreferences({ popupAnchor: 'corner' })
  ).rejects.toThrow()
})

test('saving some fields keeps newer changes to the others', async () => {
  const store = createSettingsStore({
    read: async () => undefined,
    write: async () => {},
  })

  await store.updatePreferences({ target: 'pl', popupAnchor: 'selection' })
  const saved = await store.save({ adaptToPage: false })

  expect(saved).toMatchObject({
    target: 'pl',
    popupAnchor: 'selection',
    adaptToPage: false,
  })
  await expect(store.save(['adaptToPage'])).rejects.toThrow()
})

test('the Translate button shows only its icon by default, and the choice is saved', async () => {
  const { compactButton: _removed, ...older } = DEFAULT_SETTINGS
  let persisted: unknown = structuredClone(older)
  const storage = {
    read: async () => persisted,
    write: async (value: unknown) => {
      persisted = structuredClone(value)
    },
  }

  const store = createSettingsStore(storage)
  expect((await store.preferences()).compactButton).toBe(true)

  await store.updatePreferences({ compactButton: false })
  expect((await createSettingsStore(storage).preferences()).compactButton).toBe(
    false
  )
  await expect(
    store.updatePreferences({ compactButton: 'yes' })
  ).rejects.toThrow()
})
