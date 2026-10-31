import { describe, expect, test } from 'bun:test'
import type { TranslationEvent } from '@/domain/translation/translation'
import { createUsageStore } from './createUsageStore'

const DAY_MS = 24 * 60 * 60 * 1000

function harness(start = new Date(2026, 9, 31, 12)) {
  let stored: unknown
  let clock = start.getTime()
  let ids = 0
  const writes: unknown[] = []

  function open() {
    return createUsageStore({
      read: async () => structuredClone(stored),
      write: async (value) => {
        stored = structuredClone(value)
        writes.push(stored)
      },
      now: () => new Date(clock),
      randomId: () => `ref-${++ids}`,
      version: '1.0.0',
    })
  }

  return {
    open,
    advance: (ms: number) => {
      clock += ms
    },
    setStored: (value: unknown) => {
      stored = value
    },
    stored: () => stored,
    writes,
  }
}

const success: TranslationEvent = {
  kind: 'provider-call',
  provider: 'azure',
  access: 'included',
  characters: 120,
  durationMs: 300,
  outcome: 'success',
}

const timeout: TranslationEvent = {
  kind: 'provider-call',
  provider: 'deepl',
  access: 'own-key',
  characters: 40,
  durationMs: 15_000,
  outcome: 'failure',
  code: 'timeout',
}

const rejected: TranslationEvent = {
  kind: 'provider-call',
  provider: 'deepl',
  access: 'own-key',
  characters: 10,
  durationMs: 90,
  outcome: 'failure',
  code: 'authentication',
  status: 403,
}

describe('local usage', () => {
  test('daily counts separate provider calls, reused results, characters, failures and uncertain timeouts', async () => {
    const usage = harness().open()

    await usage.record(success)
    await usage.record(success)
    await usage.record({
      kind: 'reused',
      provider: 'azure',
      access: 'included',
    })
    await usage.record(timeout)
    await usage.record(rejected)

    expect(await usage.view()).toMatchObject({
      trackingSince: '2026-10-31',
      days: [
        {
          date: '2026-10-31',
          provider: 'azure',
          access: 'included',
          requests: 2,
          succeeded: 2,
          characters: 240,
          failed: 0,
          uncertain: 0,
          reused: 1,
        },
        {
          date: '2026-10-31',
          provider: 'deepl',
          access: 'own-key',
          requests: 2,
          succeeded: 0,
          characters: 0,
          failed: 1,
          uncertain: 1,
          reused: 0,
        },
      ],
      diagnostics: { enabled: false, count: 0 },
    })
  })

  test('counts survive a worker restart and concurrent updates are not lost', async () => {
    const setup = harness()
    const first = setup.open()

    await Promise.all(Array.from({ length: 20 }, () => first.record(success)))

    const restarted = setup.open()
    await restarted.record(success)

    expect((await restarted.view()).days[0]).toMatchObject({ requests: 21 })
  })

  test('summaries older than 90 days are removed', async () => {
    const setup = harness()
    const usage = setup.open()

    await usage.record(success)
    setup.advance(90 * DAY_MS)
    await usage.record(timeout)

    const days = (await usage.view()).days
    expect(days.map((day) => day.provider)).toEqual(['deepl'])
  })

  test('diagnostics are off by default and record only allowlisted failure fields when enabled', async () => {
    const setup = harness()
    const usage = setup.open()

    await usage.record(rejected)
    expect((await usage.exportDiagnostics()).records).toEqual([])

    await usage.setDiagnostics(true)
    await usage.record(success)
    await usage.record(rejected)

    const exported = await usage.exportDiagnostics()
    expect(exported).toMatchObject({
      format: 'shvyd-diagnostics',
      extensionVersion: '1.0.0',
      records: [
        {
          reference: 'ref-1',
          time: expect.any(String),
          version: '1.0.0',
          provider: 'deepl',
          code: 'authentication',
          status: 403,
          durationMs: 90,
        },
      ],
    })
    expect(Object.keys(exported.records[0] ?? {}).sort()).toEqual([
      'code',
      'durationMs',
      'provider',
      'reference',
      'status',
      'time',
      'version',
    ])
  })

  test('diagnostics keep at most 100 records and nothing older than seven days', async () => {
    const setup = harness()
    const usage = setup.open()
    await usage.setDiagnostics(true)

    await usage.record(timeout)
    setup.advance(DAY_MS)

    for (let index = 0; index < 105; index++) {
      await usage.record(rejected)
    }

    expect((await usage.view()).diagnostics.count).toBe(100)

    setup.advance(7 * DAY_MS)
    await usage.record(timeout)
    expect((await usage.exportDiagnostics()).records).toHaveLength(1)
  })

  test('turning diagnostics off deletes kept records, and clearing usage keeps the diagnostics choice', async () => {
    const usage = harness().open()
    await usage.setDiagnostics(true)
    await usage.record(rejected)
    await usage.record(success)

    await usage.clearUsage()
    expect(await usage.view()).toMatchObject({
      days: [],
      diagnostics: { enabled: true, count: 1 },
    })

    await usage.setDiagnostics(false)
    expect((await usage.view()).diagnostics).toEqual({
      enabled: false,
      count: 0,
    })
  })

  test('clearing diagnostics keeps usage counts', async () => {
    const usage = harness().open()
    await usage.setDiagnostics(true)
    await usage.record(rejected)

    await usage.clearDiagnostics()

    expect(await usage.view()).toMatchObject({
      days: [{ requests: 1 }],
      diagnostics: { enabled: true, count: 0 },
    })
  })

  test('unreadable stored data starts fresh instead of failing', async () => {
    const setup = harness()
    setup.setStored({ version: 1, days: 'broken' })
    const usage = setup.open()

    await usage.record(success)

    expect((await usage.view()).days).toHaveLength(1)
  })

  test('a storage failure rejects only that update and later updates still work', async () => {
    let fail = true
    let stored: unknown
    const usage = createUsageStore({
      read: async () => stored,
      write: async (value) => {
        if (fail) {
          fail = false
          throw new Error('quota exceeded')
        }
        stored = value
      },
      version: '1.0.0',
    })

    await expect(usage.record(success)).rejects.toThrow('quota exceeded')
    await usage.record(success)

    expect((await usage.view()).days[0]).toMatchObject({ requests: 1 })
  })
})
