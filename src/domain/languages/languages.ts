import snapshot from './language-data.json'

export type Language = string
export type Provider = 'azure' | 'deepl'
export const LANGUAGES = snapshot.languages.map((language) => ({
  ...language,
  direction: language.direction === 'rtl' ? ('rtl' as const) : ('ltr' as const),
}))

const byCode = new Map(LANGUAGES.map((language) => [language.code, language]))
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && byCode.has(value)
}

export function getLanguage(code: Language) {
  return byCode.get(code)
}

export function supportedLanguages(provider: Provider) {
  return LANGUAGES.filter((language) => language[provider] !== null)
}

export function supportsLanguage(code: Language, provider: Provider): boolean {
  return !!getLanguage(code)?.[provider]
}

export function languageLabel(code: Language): string {
  return getLanguage(code)?.label ?? code
}

export function languageTitle(code: Language): string {
  const language = getLanguage(code)
  return language
    ? language.name === language.label
      ? language.name
      : `${language.label} · ${language.name}`
    : code
}
