import {
  isLanguage,
  supportsLanguage,
  type Language,
  type Provider,
} from '@/domain/languages/languages'
import { isRecord } from '@/utils/isRecord'

export type Preferences = {
  provider: Provider
  target: Language
  adaptToPage: boolean
  favoriteLanguages: Language[]
  showOtherLanguages: boolean
  targetMode: 'last' | 'fixed'
  defaultTarget: Language
}

export type Settings = Preferences & {
  azure: { key: string; region: string }
  deepl: {
    key: string
    endpoint: 'https://api-free.deepl.com' | 'https://api.deepl.com'
  }
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'azure',
  target: 'uk',
  adaptToPage: true,
  favoriteLanguages: ['uk', 'en', 'pl'],
  showOtherLanguages: true,
  targetMode: 'last',
  defaultTarget: 'uk',
  azure: { key: '', region: '' },
  deepl: { key: '', endpoint: 'https://api-free.deepl.com' },
}

export function isProvider(value: unknown): value is Provider {
  return value === 'azure' || value === 'deepl'
}

export function parsePreferences(value: unknown): Preferences {
  if (
    !isRecord(value) ||
    !isProvider(value.provider) ||
    !isLanguage(value.target) ||
    typeof value.adaptToPage !== 'boolean'
  ) {
    throw new Error('Invalid translation preferences.')
  }

  const rawFavorites =
    value.favoriteLanguages ?? DEFAULT_SETTINGS.favoriteLanguages
  if (
    !Array.isArray(rawFavorites) ||
    !rawFavorites.length ||
    rawFavorites.length > 300 ||
    !rawFavorites.every(isLanguage)
  ) {
    throw new Error('Choose at least one preferred language from the list.')
  }

  const favoriteLanguages = [...new Set(rawFavorites)]
  const showOtherLanguages = value.showOtherLanguages ?? true
  const targetMode = value.targetMode ?? 'last'
  const defaultTarget = value.defaultTarget ?? 'uk'
  if (
    typeof showOtherLanguages !== 'boolean' ||
    (targetMode !== 'last' && targetMode !== 'fixed') ||
    !isLanguage(defaultTarget)
  ) {
    throw new Error('Check the target language preferences.')
  }

  const provider = value.provider
  const fallback =
    favoriteLanguages.find((code) => supportsLanguage(code, provider)) ?? 'uk'

  return {
    provider: value.provider,
    target: supportsLanguage(value.target, value.provider)
      ? value.target
      : fallback,
    adaptToPage: value.adaptToPage,
    favoriteLanguages,
    showOtherLanguages,
    targetMode,
    defaultTarget: supportsLanguage(defaultTarget, value.provider)
      ? defaultTarget
      : fallback,
  }
}

export function initialTarget(preferences: Preferences): Language {
  return preferences.targetMode === 'fixed'
    ? preferences.defaultTarget
    : preferences.target
}

function credential(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512 || /[\r\n]/.test(value)) {
    throw new Error('Check the API key. It should be a single line.')
  }

  return value.trim()
}

export function parseSettings(value: unknown): Settings {
  const preferences = parsePreferences(value)

  if (!isRecord(value) || !isRecord(value.azure) || !isRecord(value.deepl)) {
    throw new Error('Invalid provider settings.')
  }

  if (
    typeof value.azure.region !== 'string' ||
    !/^[a-z0-9-]{0,64}$/i.test(value.azure.region)
  ) {
    throw new Error(
      'Check the Azure location code, or leave it empty for Global.'
    )
  }

  if (
    value.deepl.endpoint !== 'https://api-free.deepl.com' &&
    value.deepl.endpoint !== 'https://api.deepl.com'
  ) {
    throw new Error('Choose an official DeepL endpoint.')
  }

  return {
    ...preferences,
    azure: {
      key: credential(value.azure.key),
      region:
        value.azure.region.toLowerCase() === 'global'
          ? ''
          : value.azure.region.toLowerCase(),
    },
    deepl: { key: credential(value.deepl.key), endpoint: value.deepl.endpoint },
  }
}

export function publicPreferences(settings: Settings): Preferences {
  return {
    provider: settings.provider,
    target: settings.target,
    adaptToPage: settings.adaptToPage,
    favoriteLanguages: [...settings.favoriteLanguages],
    showOtherLanguages: settings.showOtherLanguages,
    targetMode: settings.targetMode,
    defaultTarget: settings.defaultTarget,
  }
}

export function settingsFromEnv(
  values: Record<string, string | undefined>
): Settings {
  return parseSettings({
    ...structuredClone(DEFAULT_SETTINGS),
    azure: {
      key: values.AZURE_TRANSLATOR_KEY ?? '',
      region: values.AZURE_TRANSLATOR_REGION ?? '',
    },
    deepl: {
      key: values.DEEPL_API_KEY ?? '',
      endpoint: (
        values.DEEPL_API_ENDPOINT ?? 'https://api-free.deepl.com'
      ).replace(/\/$/, ''),
    },
  })
}
