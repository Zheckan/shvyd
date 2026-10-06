import { expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { testConnection } from './testConnection'

test('connection testing sends a fresh small request using the supplied inactive provider credentials', async () => {
  const requests: Request[] = []
  const settings = {
    ...DEFAULT_SETTINGS,
    deepl: { ...DEFAULT_SETTINGS.deepl, key: 'test-deepl-key' },
  }
  const fetcher = async (url: string, init: RequestInit) => {
    requests.push(new Request(url, init))

    return Response.json({ translations: [{ text: 'Привіт' }] })
  }

  await testConnection({ settings, provider: 'deepl', fetcher })
  const result = await testConnection({ settings, provider: 'deepl', fetcher })

  expect(requests).toHaveLength(2)
  expect(requests[0]?.url).toBe('https://api-free.deepl.com/v2/translate')
  expect(requests[0]?.headers.get('Authorization')).toBe(
    'DeepL-Auth-Key test-deepl-key'
  )
  expect(await requests[0]?.json()).toEqual({
    text: ['Hello'],
    target_lang: 'UK',
    model_type: 'latency_optimized',
  })
  expect(result.durationMs).toBeGreaterThanOrEqual(0)
  expect(settings.provider).toBe('azure')
})
