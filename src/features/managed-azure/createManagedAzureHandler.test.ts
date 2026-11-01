import { expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { createTranslationService } from '@/domain/translation/createTranslationService'
import { createManagedAzureHandler } from './createManagedAzureHandler'

test('shared Azure preserves confirmed quota exhaustion through the translation-service boundary', async () => {
  const relay = createManagedAzureHandler({
    key: 'server-only-key',
    region: '',
    allowedOrigins: [],
    allowRequest: async () => true,
    fetcher: async () =>
      Response.json(
        {
          error: { code: 403001, message: 'server-only-key upstream details' },
        },
        { status: 403 }
      ),
  })
  const service = createTranslationService({
    readSettings: async () => DEFAULT_SETTINGS,
    managedAzureUrl: 'https://relay.example.com/translate',
    fetcher: async (url, init) => relay(new Request(url, init)),
  })
  await expect(
    service.translate({ text: 'Hello', target: 'uk' })
  ).rejects.toMatchObject({
    code: 'quota',
    message:
      "The provider's character allowance is exhausted. Check your quota or choose another provider in settings.",
  })
})

test.each([true, false])(
  'shared Azure reports temporary limiting whether it comes from upstream or the relay, upstream=%s',
  async (upstream) => {
    const relay = createManagedAzureHandler({
      key: 'server-only-key',
      region: '',
      allowedOrigins: [],
      allowRequest: async () => upstream,
      fetcher: async () => new Response('server-only-key', { status: 429 }),
    })
    const service = createTranslationService({
      readSettings: async () => DEFAULT_SETTINGS,
      managedAzureUrl: 'https://relay.example.com/translate',
      fetcher: async (url, init) => relay(new Request(url, init)),
    })
    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({
      code: 'rate-limit',
      message: 'Too many translation requests. Wait a moment and try again.',
    })
  }
)

test('shared Azure preserves an upstream timeout for an actionable retry', async () => {
  const relay = createManagedAzureHandler({
    key: 'server-only-key',
    region: '',
    allowedOrigins: [],
    allowRequest: async () => true,
    fetcher: async () => {
      throw new DOMException('server-only-key', 'TimeoutError')
    },
  })
  const service = createTranslationService({
    readSettings: async () => DEFAULT_SETTINGS,
    managedAzureUrl: 'https://relay.example.com/translate',
    fetcher: async (url, init) => relay(new Request(url, init)),
  })
  await expect(
    service.translate({ text: 'Hello', target: 'uk' })
  ).rejects.toMatchObject({
    code: 'timeout',
    message: 'Translation took too long. Try again.',
  })
})
