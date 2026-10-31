import type { Provider } from '@/domain/languages/languages'
import { isProvider } from '@/domain/settings/settings'
import {
  isErrorCode,
  type ErrorCode,
  type TranslationAccess,
  type TranslationEvent,
} from '@/domain/translation/translation'
import { isRecord } from '@/utils/isRecord'

export const USAGE_RETENTION_DAYS = 90
export const DIAGNOSTIC_LIMIT = 100
export const DIAGNOSTIC_RETENTION_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type UsageCounts = {
  requests: number
  succeeded: number
  characters: number
  failed: number
  uncertain: number
  reused: number
}

export type UsageRoute = { provider: Provider; access: TranslationAccess }

export type UsageDay = UsageRoute & UsageCounts & { date: string }

export type UsageRow = UsageRoute & UsageCounts

export type DiagnosticRecord = {
  reference: string
  time: string
  version: string
  provider: Provider
  code: ErrorCode
  status?: number
  durationMs: number
}

export type UsageState = {
  version: 1
  trackingSince: string
  days: UsageDay[]
  diagnostics: { enabled: boolean; records: DiagnosticRecord[] }
}

export type UsageView = {
  trackingSince: string
  days: UsageDay[]
  diagnostics: { enabled: boolean; count: number }
}

export type DiagnosticsExport = {
  format: 'shvyd-diagnostics'
  formatVersion: 1
  extensionVersion: string
  exportedAt: string
  retention: string
  excluded: string
  records: DiagnosticRecord[]
}

const COUNT_KEYS = [
  'requests',
  'succeeded',
  'characters',
  'failed',
  'uncertain',
  'reused',
] as const

function emptyCounts(): UsageCounts {
  return {
    requests: 0,
    succeeded: 0,
    characters: 0,
    failed: 0,
    uncertain: 0,
    reused: 0,
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local calendar date, matching what the person sees on their clock. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function daysBefore(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - days)
  return result
}

export function createUsageState(now: Date): UsageState {
  return {
    version: 1,
    trackingSince: dateKey(now),
    days: [],
    diagnostics: { enabled: false, records: [] },
  }
}

function isAccess(value: unknown): value is TranslationAccess {
  return value === 'included' || value === 'own-key'
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value)
}

function parseDay(value: unknown): UsageDay {
  if (
    !isRecord(value) ||
    !isDate(value.date) ||
    !isProvider(value.provider) ||
    !isAccess(value.access) ||
    !COUNT_KEYS.every((key) => isCount(value[key]))
  ) {
    throw new Error('Usage data could not be read.')
  }

  const day: UsageDay = {
    date: value.date,
    provider: value.provider,
    access: value.access,
    ...emptyCounts(),
  }

  for (const key of COUNT_KEYS) {
    day[key] = Number(value[key])
  }

  return day
}

function parseDays(value: unknown): UsageDay[] {
  if (!Array.isArray(value)) {
    throw new Error('Usage data could not be read.')
  }

  return value.map(parseDay)
}

export function parseDiagnosticRecord(value: unknown): DiagnosticRecord {
  if (
    !isRecord(value) ||
    typeof value.reference !== 'string' ||
    typeof value.time !== 'string' ||
    Number.isNaN(Date.parse(value.time)) ||
    typeof value.version !== 'string' ||
    !isProvider(value.provider) ||
    !isErrorCode(value.code) ||
    (value.status !== undefined && !isCount(value.status)) ||
    !isCount(value.durationMs)
  ) {
    throw new Error('Diagnostic data could not be read.')
  }

  return {
    reference: value.reference,
    time: value.time,
    version: value.version,
    provider: value.provider,
    code: value.code,
    ...(value.status === undefined ? {} : { status: Number(value.status) }),
    durationMs: value.durationMs,
  }
}

export function parseUsageState(value: unknown): UsageState {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isDate(value.trackingSince) ||
    !isRecord(value.diagnostics) ||
    typeof value.diagnostics.enabled !== 'boolean' ||
    !Array.isArray(value.diagnostics.records)
  ) {
    throw new Error('Usage data could not be read.')
  }

  return {
    version: 1,
    trackingSince: value.trackingSince,
    days: parseDays(value.days),
    diagnostics: {
      enabled: value.diagnostics.enabled,
      records: value.diagnostics.records.map(parseDiagnosticRecord),
    },
  }
}

export function parseUsageView(value: unknown): UsageView {
  if (
    !isRecord(value) ||
    !isDate(value.trackingSince) ||
    !isRecord(value.diagnostics) ||
    typeof value.diagnostics.enabled !== 'boolean' ||
    !isCount(value.diagnostics.count)
  ) {
    throw new Error('Usage could not be read.')
  }

  return {
    trackingSince: value.trackingSince,
    days: parseDays(value.days),
    diagnostics: {
      enabled: value.diagnostics.enabled,
      count: value.diagnostics.count,
    },
  }
}

export function parseDiagnosticsExport(value: unknown): DiagnosticsExport {
  if (
    !isRecord(value) ||
    value.format !== 'shvyd-diagnostics' ||
    value.formatVersion !== 1 ||
    typeof value.extensionVersion !== 'string' ||
    typeof value.exportedAt !== 'string' ||
    typeof value.retention !== 'string' ||
    typeof value.excluded !== 'string' ||
    !Array.isArray(value.records)
  ) {
    throw new Error('Diagnostics could not be read.')
  }

  return {
    format: 'shvyd-diagnostics',
    formatVersion: 1,
    extensionVersion: value.extensionVersion,
    exportedAt: value.exportedAt,
    retention: value.retention,
    excluded: value.excluded,
    records: value.records.map(parseDiagnosticRecord),
  }
}

export function pruneUsage(state: UsageState, now: Date): UsageState {
  const firstDay = dateKey(daysBefore(now, USAGE_RETENTION_DAYS - 1))
  const oldestRecord = now.getTime() - DIAGNOSTIC_RETENTION_DAYS * DAY_MS

  return {
    ...state,
    days: state.days.filter((day) => day.date >= firstDay),
    diagnostics: {
      ...state.diagnostics,
      records: state.diagnostics.records
        .filter((record) => Date.parse(record.time) > oldestRecord)
        .slice(-DIAGNOSTIC_LIMIT),
    },
  }
}

function addToDay(
  days: UsageDay[],
  date: string,
  route: UsageRoute,
  change: Partial<UsageCounts>
): UsageDay[] {
  const index = days.findIndex(
    (day) =>
      day.date === date &&
      day.provider === route.provider &&
      day.access === route.access
  )
  const current =
    index === -1 ? { date, ...route, ...emptyCounts() } : days[index]

  if (!current) {
    return days
  }

  const next = { ...current }

  for (const key of COUNT_KEYS) {
    next[key] += change[key] ?? 0
  }

  if (index === -1) {
    return [...days, next]
  }

  return days.map((day, position) => (position === index ? next : day))
}

function countsFor(event: TranslationEvent): Partial<UsageCounts> {
  if (event.kind === 'reused') {
    return { reused: 1 }
  }

  if (event.outcome === 'success') {
    return { requests: 1, succeeded: 1, characters: event.characters }
  }

  // A timed-out request may still have been completed and charged by the provider.
  if (event.code === 'timeout') {
    return { requests: 1, uncertain: 1 }
  }

  return { requests: 1, failed: 1 }
}

export function recordUsage(
  state: UsageState,
  event: TranslationEvent,
  context: { now: Date; makeReference: () => string; version: string }
): UsageState {
  const route = { provider: event.provider, access: event.access }
  const days = addToDay(
    state.days,
    dateKey(context.now),
    route,
    countsFor(event)
  )
  let records = state.diagnostics.records

  if (
    state.diagnostics.enabled &&
    event.kind === 'provider-call' &&
    event.outcome === 'failure'
  ) {
    records = [
      ...records,
      {
        reference: context.makeReference(),
        time: context.now.toISOString(),
        version: context.version,
        provider: event.provider,
        code: event.code,
        ...(event.status === undefined ? {} : { status: event.status }),
        durationMs: Math.max(0, Math.round(event.durationMs)),
      },
    ]
  }

  return pruneUsage(
    { ...state, days, diagnostics: { ...state.diagnostics, records } },
    context.now
  )
}

export function usageView(state: UsageState): UsageView {
  return {
    trackingSince: state.trackingSince,
    days: state.days,
    diagnostics: {
      enabled: state.diagnostics.enabled,
      count: state.diagnostics.records.length,
    },
  }
}

export function exportDiagnostics(
  state: UsageState,
  context: { now: Date; version: string }
): DiagnosticsExport {
  return {
    format: 'shvyd-diagnostics',
    formatVersion: 1,
    extensionVersion: context.version,
    exportedAt: context.now.toISOString(),
    retention: `At most ${DIAGNOSTIC_LIMIT} records, none older than ${DIAGNOSTIC_RETENTION_DAYS} days.`,
    excluded:
      'API keys, request headers, provider responses, selected text, translations, page addresses and page titles are never recorded.',
    records: state.diagnostics.records,
  }
}

/** Totals per provider route for days on or after `firstDay`. */
export function summarizeUsage(days: UsageDay[], firstDay: string): UsageRow[] {
  const rows: UsageRow[] = []

  for (const day of days) {
    if (day.date < firstDay) {
      continue
    }

    let row = rows.find(
      (candidate) =>
        candidate.provider === day.provider && candidate.access === day.access
    )

    if (!row) {
      row = { provider: day.provider, access: day.access, ...emptyCounts() }
      rows.push(row)
    }

    for (const key of COUNT_KEYS) {
      row[key] += day[key]
    }
  }

  return rows
}
