import { describe, expect, test } from 'bun:test'
import type { UsageView } from '@/domain/usage/usage'
import { formatDeepLUsage, usageTable } from './formatUsage'

const view: UsageView = {
  trackingSince: '2026-10-01',
  days: [
    {
      date: '2026-10-01',
      provider: 'azure',
      access: 'included',
      requests: 4,
      succeeded: 4,
      characters: 900,
      failed: 0,
      uncertain: 0,
      reused: 0,
    },
    {
      date: '2026-10-31',
      provider: 'azure',
      access: 'included',
      requests: 2,
      succeeded: 1,
      characters: 12345,
      failed: 1,
      uncertain: 0,
      reused: 6,
    },
  ],
  diagnostics: { enabled: false, count: 0 },
}

describe('usage formatting', () => {
  test('today shows only calendar-day totals with readable route names and grouped numbers', () => {
    expect(usageTable(view, 1, new Date(2026, 9, 31, 9))).toEqual({
      rows: [
        {
          route: 'Azure · included',
          requests: '2',
          characters: '12,345',
          reused: '6',
          failed: '1',
          uncertain: '0',
        },
      ],
      empty: false,
    })
  })

  test('a 30-day period includes the first day of that window', () => {
    const table = usageTable(view, 31, new Date(2026, 9, 31, 9))
    expect(table.rows[0]?.requests).toBe('6')
  })

  test('a period without activity is reported as empty', () => {
    expect(usageTable(view, 1, new Date(2026, 10, 2))).toEqual({
      rows: [],
      empty: true,
    })
  })

  test('DeepL allowance shows used, total and percentage with the check time', () => {
    expect(
      formatDeepLUsage({
        characterCount: 125000,
        characterLimit: 500000,
        checkedAt: '2026-10-31T10:05:00.000Z',
      })
    ).toMatch(/^125,000 of 500,000 characters used \(25%\) · checked /)
  })
})
