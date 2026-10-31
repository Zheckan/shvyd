import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, type Settings } from '@/domain/settings/settings'
import { checkDeepLUsage, parseDeepLUsage } from './checkDeepLUsage'

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  deepl: { key: 'deepl-key', endpoint: 'https://api-free.deepl.com' },
}

describe('DeepL allowance check', () => {
  test('reads the account allowance with an authenticated GET and records when it was checked', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const result = await checkDeepLUsage({
      settings,
      now: () => new Date('2026-10-31T10:00:00Z'),
      fetcher: async (url, init) => {
        calls.push({ url, init })
        return Response.json({ character_count: 1200, character_limit: 500000 })
      },
    })

    expect(result).toEqual({
      characterCount: 1200,
      characterLimit: 500000,
      checkedAt: '2026-10-31T10:00:00.000Z',
    })
    expect(calls[0]?.url).toBe('https://api-free.deepl.com/v2/usage')
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.headers).toEqual({
      Authorization: 'DeepL-Auth-Key deepl-key',
    })
  })

  test('a rejected key and a rate limit keep their own messages', async () => {
    await expect(
      checkDeepLUsage({
        settings,
        fetcher: async () => new Response('', { status: 403 }),
      })
    ).rejects.toMatchObject({ code: 'authentication' })
    await expect(
      checkDeepLUsage({
        settings,
        fetcher: async () => new Response('', { status: 429 }),
      })
    ).rejects.toMatchObject({ code: 'rate-limit' })
  })

  test('requires a DeepL key and never sends an empty one', async () => {
    let called = false
    await expect(
      checkDeepLUsage({
        settings: DEFAULT_SETTINGS,
        fetcher: async () => {
          called = true
          return Response.json({})
        },
      })
    ).rejects.toMatchObject({ code: 'configuration' })
    expect(called).toBe(false)
  })

  test('an unreadable allowance response is rejected', async () => {
    await expect(
      checkDeepLUsage({
        settings,
        fetcher: async () => Response.json({ character_count: 'many' }),
      })
    ).rejects.toMatchObject({ code: 'provider' })
    expect(() => parseDeepLUsage({ characterCount: 1 })).toThrow()
  })
})
