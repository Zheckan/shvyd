import type { Settings } from '@/domain/settings/settings'

/** Fields that differ from what the page last loaded or saved. */
export function changedSettings(
  base: Settings,
  next: Settings
): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(base[key as keyof Settings])
    )
  )
}
