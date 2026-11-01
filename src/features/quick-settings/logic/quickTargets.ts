import {
  languageLabel,
  supportsLanguage,
  type Language,
} from '@/domain/languages/languages'
import { initialTarget, type Preferences } from '@/domain/settings/settings'

export type TargetOption = { code: Language; label: string; selected: boolean }

/** The preferred languages this provider supports, plus the one in use. */
export function quickTargets(preferences: Preferences): TargetOption[] {
  const current = initialTarget(preferences)
  const codes = preferences.favoriteLanguages.filter((code) =>
    supportsLanguage(code, preferences.provider)
  )

  if (!codes.includes(current)) {
    codes.push(current)
  }

  return codes.map((code) => ({
    code,
    label: languageLabel(code),
    selected: code === current,
  }))
}

/** Changes whichever target new popups start with. */
export function targetChange(
  preferences: Preferences,
  code: Language
): Partial<Preferences> {
  return preferences.targetMode === 'fixed'
    ? { defaultTarget: code }
    : { target: code }
}
