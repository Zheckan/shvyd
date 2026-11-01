import type { DeepLUsage } from '@/domain/translation/checkDeepLUsage'
import {
  dateKey,
  daysBefore,
  summarizeUsage,
  type UsageRow,
  type UsageView,
} from '@/domain/usage/usage'

export type UsageTableRow = {
  route: string
  requests: string
  characters: string
  reused: string
  failed: string
  uncertain: string
}

const numbers = new Intl.NumberFormat('en')

const ROUTE_LABELS: Record<string, string> = {
  'azure:included': 'Azure · included',
  'azure:own-key': 'Azure · your key',
  'deepl:own-key': 'DeepL · your key',
}

function routeLabel(row: UsageRow): string {
  return ROUTE_LABELS[`${row.provider}:${row.access}`] ?? row.provider
}

/** `periodDays` counts today as the first day, so 1 means today only. */
export function usageTable(
  view: UsageView,
  periodDays: number,
  now: Date
): { rows: UsageTableRow[]; empty: boolean } {
  const firstDay = dateKey(daysBefore(now, periodDays - 1))
  const rows = summarizeUsage(view.days, firstDay)
    .filter((row) => row.requests > 0 || row.reused > 0)
    .map((row) => ({
      route: routeLabel(row),
      requests: numbers.format(row.requests),
      characters: numbers.format(row.characters),
      reused: numbers.format(row.reused),
      failed: numbers.format(row.failed),
      uncertain: numbers.format(row.uncertain),
    }))

  return { rows, empty: rows.length === 0 }
}

export function formatDeepLUsage(usage: DeepLUsage): string {
  const checked = new Date(usage.checkedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const used = numbers.format(usage.characterCount)

  if (usage.characterLimit === 0) {
    return `${used} characters used · checked ${checked}`
  }

  const percent = Math.round(
    (usage.characterCount / usage.characterLimit) * 100
  )

  return `${used} of ${numbers.format(usage.characterLimit)} characters used (${percent}%) · checked ${checked}`
}

export function formatTrackingSince(view: UsageView): string {
  const [year, month, day] = view.trackingSince.split('-').map(Number)
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)

  return `Counted on this browser since ${date.toLocaleDateString(undefined, { dateStyle: 'medium' })}`
}
