import { isLanguage, type Language } from '@/domain/languages/languages'
import { isRecord } from '@/utils/isRecord'
import {
  DEFAULT_SETTINGS,
  isProvider,
  parseSettings,
  publicPreferences,
  type Settings,
} from './settings'

function preferenceField<T>(
  value: Record<string, unknown>,
  key: string,
  valid: (raw: unknown) => raw is T,
  fallback: T
): T {
  const raw = value[key]
  if (raw === undefined) return fallback
  if (!valid(raw)) throw new Error('Invalid preferences.')
  return raw
}

export function createSettingsStore(storage: {
  read: () => Promise<unknown>
  write: (settings: Settings) => Promise<void>
  seed: () => Promise<unknown>
}) {
  let current = structuredClone(DEFAULT_SETTINGS)
  let queue = Promise.resolve()
  const ready = (async () => {
    const persisted = await storage.read()
    if (persisted !== undefined) {
      current = parseSettings(persisted)
    } else {
      current = parseSettings(await storage.seed())
      await storage.write(current)
    }
  })()

  async function settings(): Promise<Settings> {
    await ready
    await queue
    return structuredClone(current)
  }

  function update(change: (current: Settings) => Settings): Promise<Settings> {
    const operation = queue.then(async () => {
      await ready
      const next = change(structuredClone(current))
      await storage.write(next)
      current = next
      return structuredClone(current)
    })
    queue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  return {
    settings,
    preferences: async () => publicPreferences(await settings()),
    save: (value: unknown) => update(() => parseSettings(value)),
    updatePreferences: async (value: unknown) => {
      if (!isRecord(value)) throw new Error('Invalid preferences.')
      const isTextMode = (raw: unknown): raw is 'last' | 'fixed' =>
        raw === 'last' || raw === 'fixed'
      const isBoolean = (raw: unknown): raw is boolean =>
        typeof raw === 'boolean'
      const isFavorites = (raw: unknown): raw is Language[] =>
        Array.isArray(raw) &&
        raw.length > 0 &&
        raw.length <= 300 &&
        raw.every(isLanguage)
      return publicPreferences(
        await update((current) =>
          parseSettings({
            ...current,
            provider: preferenceField(
              value,
              'provider',
              isProvider,
              current.provider
            ),
            target: preferenceField(
              value,
              'target',
              isLanguage,
              current.target
            ),
            adaptToPage: preferenceField(
              value,
              'adaptToPage',
              isBoolean,
              current.adaptToPage
            ),
            favoriteLanguages: preferenceField(
              value,
              'favoriteLanguages',
              isFavorites,
              current.favoriteLanguages
            ),
            showOtherLanguages: preferenceField(
              value,
              'showOtherLanguages',
              isBoolean,
              current.showOtherLanguages
            ),
            targetMode: preferenceField(
              value,
              'targetMode',
              isTextMode,
              current.targetMode
            ),
            defaultTarget: preferenceField(
              value,
              'defaultTarget',
              isLanguage,
              current.defaultTarget
            ),
          })
        )
      )
    },
  }
}
