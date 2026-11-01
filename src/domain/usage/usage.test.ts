import { describe, expect, test } from 'bun:test'
import { parseUsageView, summarizeUsage, type UsageDay } from './usage'

function day(date: string, changes: Partial<UsageDay>): UsageDay {
  return {
    date,
    provider: 'azure',
    access: 'included',
    requests: 0,
    succeeded: 0,
    characters: 0,
    failed: 0,
    uncertain: 0,
    reused: 0,
    ...changes,
  }
}

describe('usage summaries', () => {
  test('totals each provider route from the first included day', () => {
    const rows = summarizeUsage(
      [
        day('2026-10-01', { requests: 9 }),
        day('2026-10-30', { requests: 2, succeeded: 2, characters: 50 }),
        day('2026-10-31', { requests: 1, failed: 1, reused: 3 }),
        day('2026-10-31', {
          provider: 'deepl',
          access: 'own-key',
          requests: 1,
          uncertain: 1,
        }),
      ],
      '2026-10-30'
    )

    expect(rows).toEqual([
      {
        provider: 'azure',
        access: 'included',
        requests: 3,
        succeeded: 2,
        characters: 50,
        failed: 1,
        uncertain: 0,
        reused: 3,
      },
      {
        provider: 'deepl',
        access: 'own-key',
        requests: 1,
        succeeded: 0,
        characters: 0,
        failed: 0,
        uncertain: 1,
        reused: 0,
      },
    ])
  })

  test('the settings page rejects a malformed usage response', () => {
    expect(() =>
      parseUsageView({
        trackingSince: '2026-10-31',
        days: [{ date: '2026-10-31', provider: 'other' }],
        diagnostics: { enabled: false, count: 0 },
      })
    ).toThrow()
  })
})
