import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, type Settings } from '@/domain/settings/settings'
import { createTranslationService } from './createTranslationService'

describe('selected-text translation', () => {
  test('the request deadline also covers a stalled response body and permits a fresh retry', async () => {
    let calls = 0
    const service = createTranslationService({
      requestTimeoutMs: 10,
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async (_url, init) => {
        calls++
        if (calls > 1) {
          return Response.json({
            value: [{ translations: [{ text: 'Recovered' }] }],
          })
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              init.signal?.addEventListener(
                'abort',
                () =>
                  controller.error(
                    new DOMException('aborted body', 'AbortError')
                  ),
                { once: true }
              )
            },
          })
        )
      },
    })
    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({ code: 'timeout' })
    expect(
      await service.translate({ text: 'Hello', target: 'uk' })
    ).toMatchObject({ text: 'Recovered', cached: false })
  }, 20_000)

  test('a provider timeout has its own retryable error instead of a connection failure', async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        throw new DOMException('deadline', 'TimeoutError')
      },
    })
    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({
      code: 'timeout',
      message: 'Translation took too long. Try again.',
    })
  })

  test('DeepL 456 reports exhausted allowance without interpreting provider text', async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        provider: 'deepl',
        deepl: { key: 'test-key', endpoint: 'https://api-free.deepl.com' },
      }),
      fetcher: async () =>
        new Response('private provider details', { status: 456 }),
    })
    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({
      code: 'quota',
      message:
        "The provider's character allowance is exhausted. Check your quota or choose another provider in settings.",
    })
  })

  test('malformed or unknown Azure 403 responses still report authentication failure', async () => {
    for (const body of [
      'not JSON',
      '{"error":{"code":403000,"message":"private"}}',
    ]) {
      const service = createTranslationService({
        readSettings: async () => ({
          ...DEFAULT_SETTINGS,
          azure: { key: 'test-key', region: '' },
        }),
        fetcher: async () => new Response(body, { status: 403 }),
      })
      await expect(
        service.translate({ text: 'Hello', target: 'uk' })
      ).rejects.toMatchObject({
        code: 'authentication',
        message: 'The API key was rejected. Check Shvyd settings.',
      })
    }
  })

  test('Azure error 403001 is exhausted allowance rather than a rejected API key', async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () =>
        Response.json(
          { error: { code: 403001, message: 'private upstream details' } },
          { status: 403 }
        ),
    })
    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({
      code: 'quota',
      message:
        "The provider's character allowance is exhausted. Check your quota or choose another provider in settings.",
    })
  })

  test('temporary request limiting is retryable and distinct from character quota exhaustion', async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () =>
        new Response('Do not expose provider details', { status: 429 }),
    })
    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({
      code: 'rate-limit',
      message: 'Too many translation requests. Wait a moment and try again.',
    })
  })

  test('keeps the 32-entry cache limit and refreshes recently read entries', async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () =>
        Response.json({ value: [{ translations: [{ text: 'Translation' }] }] }),
    })
    for (let index = 0; index < 32; index++) {
      await service.translate({ text: `Selection ${index}`, target: 'uk' })
    }
    await service.translate({ text: 'Selection 0', target: 'uk' })
    await service.translate({ text: 'Selection 32', target: 'uk' })
    expect(
      (await service.translate({ text: 'Selection 0', target: 'uk' })).cached
    ).toBe(true)
    expect(
      (await service.translate({ text: 'Selection 1', target: 'uk' })).cached
    ).toBe(false)
  })

  test('a recreated service starts with an empty cache and still translates with saved settings', async () => {
    const options = {
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'saved-key', region: '' },
      }),
      fetcher: async () =>
        Response.json({ value: [{ translations: [{ text: 'Привіт' }] }] }),
    }
    const first = createTranslationService(options)
    await first.translate({ text: 'Hello', target: 'uk' })
    expect(
      (await first.translate({ text: 'Hello', target: 'uk' })).cached
    ).toBe(true)

    const restarted = createTranslationService(options)
    expect(
      await restarted.translate({ text: 'Hello', target: 'uk' })
    ).toMatchObject({ text: 'Привіт', cached: false })
  })

  test('a failed shared request reaches every caller and a later retry sends fresh work', async () => {
    let calls = 0
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        calls++
        if (calls === 1) {
          await Bun.sleep(0)
          throw new TypeError('Unreachable')
        }
        return Response.json({
          value: [{ translations: [{ text: 'Recovered' }] }],
        })
      },
    })
    const outcomes = await Promise.allSettled([
      service.translate({ text: 'Hello', target: 'uk' }),
      service.translate({ text: 'Hello', target: 'uk' }),
    ])
    expect(outcomes).toMatchObject([
      { status: 'rejected', reason: { code: 'network' } },
      { status: 'rejected', reason: { code: 'network' } },
    ])
    expect(
      await service.translate({ text: 'Hello', target: 'uk' })
    ).toMatchObject({ text: 'Recovered', cached: false })
    expect(calls).toBe(2)
  })

  test('changing a DeepL endpoint cannot reuse a translation from the previous endpoint', async () => {
    let settings: Settings = {
      ...DEFAULT_SETTINGS,
      provider: 'deepl',
      deepl: { key: 'test-key', endpoint: 'https://api-free.deepl.com' },
    }
    const urls: string[] = []
    const service = createTranslationService({
      readSettings: async () => settings,
      fetcher: async (url) => {
        urls.push(url)
        return Response.json({ translations: [{ text: 'Translation' }] })
      },
    })

    await service.translate({ text: 'Hello', target: 'uk' })
    settings = {
      ...settings,
      deepl: { key: 'test-key', endpoint: 'https://api.deepl.com' },
    }
    expect(
      (await service.translate({ text: 'Hello', target: 'uk' })).cached
    ).toBe(false)
    expect(urls).toEqual([
      'https://api-free.deepl.com/v2/translate',
      'https://api.deepl.com/v2/translate',
    ])
  })

  test('returns oversized translations without caching them or evicting useful small entries', async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init.body))
        return Response.json({
          value: [
            {
              translations: [
                {
                  text:
                    body.inputs[0].text === 'Huge'
                      ? 'ї'.repeat(300_000)
                      : 'Small',
                },
              ],
            },
          ],
        })
      },
    })

    await service.translate({ text: 'Small', target: 'uk' })
    expect(
      (await service.translate({ text: 'Huge', target: 'uk' })).text.length
    ).toBe(300_000)
    expect(
      (await service.translate({ text: 'Huge', target: 'uk' })).cached
    ).toBe(false)
    expect(
      (await service.translate({ text: 'Small', target: 'uk' })).cached
    ).toBe(true)
  })

  test('evicts old translations when UTF-8 payloads exceed the 512 KiB cache budget', async () => {
    let calls = 0
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        calls++
        return Response.json({
          value: [{ translations: [{ text: 'ї'.repeat(100_000) }] }],
        })
      },
    })

    for (const text of ['First', 'Second', 'Third']) {
      await service.translate({ text, target: 'uk' })
    }
    expect(
      await service.translate({ text: 'Third', target: 'uk' })
    ).toMatchObject({ cached: true })
    expect(
      await service.translate({ text: 'Second', target: 'uk' })
    ).toMatchObject({ cached: true })
    expect(
      await service.translate({ text: 'First', target: 'uk' })
    ).toMatchObject({ cached: false })
    expect(calls).toBe(4)
  })

  test('clearing settings while a request runs starts fresh work and keeps late results out of the cache', async () => {
    let release: () => void = () => undefined
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        const call = ++calls
        if (call === 1) {
          await ready
        }
        return Response.json({
          value: [{ translations: [{ text: call === 1 ? 'Old' : 'Fresh' }] }],
        })
      },
    })

    const old = service.translate({ text: 'Hello', target: 'uk' })
    await Bun.sleep(0)
    service.clearCache()
    const fresh = service.translate({ text: 'Hello', target: 'uk' })
    await Bun.sleep(0)
    release()

    expect(await old).toMatchObject({ text: 'Old' })
    expect(await fresh).toMatchObject({ text: 'Fresh', cached: false })
    expect(
      await service.translate({ text: 'Hello', target: 'uk' })
    ).toMatchObject({ text: 'Fresh', cached: true })
    expect(calls).toBe(2)
  })

  test('simultaneous identical selections share one provider request', async () => {
    let release: () => void = () => undefined
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        calls++
        await ready
        return Response.json({
          value: [{ translations: [{ text: 'Привіт' }] }],
        })
      },
    })

    const first = service.translate({ text: 'Hello', target: 'uk' })
    const second = service.translate({ text: 'Hello', target: 'uk' })
    await Bun.sleep(0)
    release()

    expect(await Promise.all([first, second])).toMatchObject([
      { text: 'Привіт', cached: false },
      { text: 'Привіт', cached: false },
    ])
    expect(calls).toBe(1)
  })

  test('uses shared Azure without receiving the owner key and switches to BYOK even for the same selection', async () => {
    let settings = structuredClone(DEFAULT_SETTINGS)
    const requests: Request[] = []
    const service = createTranslationService({
      readSettings: async () => settings,
      managedAzureUrl: 'https://translation.example.com/translate',
      fetcher: async (url, init) => {
        requests.push(new Request(url, init))

        return Response.json({
          value: [{ translations: [{ text: 'Привіт' }] }],
        })
      },
    })

    await service.translate({ text: 'Hello', target: 'uk' })
    expect(requests[0]?.url).toBe('https://translation.example.com/translate')
    expect(requests[0]?.headers.has('Ocp-Apim-Subscription-Key')).toBe(false)
    expect(await requests[0]?.json()).toEqual({
      text: 'Hello',
      format: 'plain',
      target: 'uk',
    })

    settings = { ...settings, azure: { key: 'user-owned-key', region: '' } }
    await service.translate({ text: 'Hello', target: 'uk' })
    expect(requests).toHaveLength(2)
    expect(requests[1]?.url).toStartWith(
      'https://api.cognitive.microsofttranslator.com/'
    )
    expect(requests[1]?.headers.get('Ocp-Apim-Subscription-Key')).toBe(
      'user-owned-key'
    )
  })

  test('rejects a target unavailable with the provider before sending selected text', async () => {
    let sent = false
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        sent = true
        return Response.json({})
      },
    })

    await expect(
      service.translate({ text: 'Hello', target: 'en-us' })
    ).rejects.toMatchObject({ code: 'configuration' })

    expect(sent).toBe(false)
  })

  test("uses the provider's script-specific language code for Traditional Chinese", async () => {
    const requests: Request[] = []
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({
          value: [{ translations: [{ text: '早安', language: 'zh-Hant' }] }],
        })
      },
    })

    expect(
      await service.translate({ text: 'Good morning', target: 'zh-hant' })
    ).toMatchObject({ text: '早安', target: 'zh-hant' })

    expect(await requests[0]?.json()).toEqual({
      inputs: [{ text: 'Good morning', targets: [{ language: 'zh-Hant' }] }],
    })
  })

  test('receives an automatic-source Azure translation in the selected target language', async () => {
    const requests: Request[] = []
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({
          value: [
            {
              detectedLanguage: { language: 'en' },
              translations: [{ text: 'Привіт', language: 'uk' }],
            },
          ],
        })
      },
    })

    const result = await service.translate({ text: 'Hello', target: 'uk' })
    expect(result).toMatchObject({
      text: 'Привіт',
      target: 'uk',
      provider: 'azure',
      cached: false,
    })

    const request = requests[0]
    expect(request?.url).toBe(
      'https://api.cognitive.microsofttranslator.com/translate?api-version=2026-06-06'
    )

    expect(await request?.json()).toEqual({
      inputs: [{ text: 'Hello', targets: [{ language: 'uk' }] }],
    })
  })

  test('preserves selected paragraph markup in one Azure request', async () => {
    const requests: Request[] = []
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({
          value: [
            {
              translations: [
                { text: '<div><p>Привіт.</p><p>Другий абзац.</p></div>' },
              ],
            },
          ],
        })
      },
    })

    const text = '<div><p>Hello.</p><p>Second paragraph.</p></div>'
    expect(
      await service.translate({ text, format: 'html', target: 'uk' })
    ).toMatchObject({
      text: '<div><p>Привіт.</p><p>Другий абзац.</p></div>',
      format: 'html',
    })

    expect(requests).toHaveLength(1)
    expect(await requests[0]?.json()).toEqual({
      inputs: [{ text, textType: 'html', targets: [{ language: 'uk' }] }],
    })
  })

  test('can use DeepL speed mode without a separate language-detection request', async () => {
    const requests: Request[] = []
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        provider: 'deepl',
        deepl: {
          key: 'test-deepl-key',
          endpoint: 'https://api-free.deepl.com',
        },
      }),
      fetcher: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({
          translations: [
            { text: 'Мені сумно.', detected_source_language: 'EN' },
          ],
        })
      },
    })

    expect(
      await service.translate({ text: 'I am feeling blue.', target: 'uk' })
    ).toMatchObject({
      text: 'Мені сумно.',
      provider: 'deepl',
      target: 'uk',
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://api-free.deepl.com/v2/translate')
    expect(await requests[0]?.json()).toEqual({
      text: ['I am feeling blue.'],
      target_lang: 'UK',
      model_type: 'latency_optimized',
    })
  })

  test('preserves HTML lists with DeepL while keeping its speed model', async () => {
    const requests: Request[] = []
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        provider: 'deepl',
        deepl: { key: 'test-key', endpoint: 'https://api-free.deepl.com' },
      }),
      fetcher: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json({
          translations: [{ text: '<div><ul><li>Привіт.</li></ul></div>' }],
        })
      },
    })

    const text = '<div><ul><li>Hello.</li></ul></div>'
    expect(
      await service.translate({ text, format: 'html', target: 'uk' })
    ).toMatchObject({ format: 'html' })

    expect(requests).toHaveLength(1)
    expect(await requests[0]?.json()).toEqual({
      text: [text],
      target_lang: 'UK',
      model_type: 'latency_optimized',
      tag_handling: 'html',
      tag_handling_version: 'v1',
    })
  })

  test('reuses a selection only for the same provider and target language', async () => {
    let calls = 0
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        calls++
        return Response.json({
          value: [{ translations: [{ text: 'Translated' }] }],
        })
      },
    })

    await service.translate({ text: 'Hello', target: 'uk' })
    expect(
      await service.translate({ text: 'Hello', target: 'uk' })
    ).toMatchObject({ cached: true })

    await service.translate({ text: 'Hello', target: 'pl' })
    expect(calls).toBe(2)
  })

  test("reports rejected credentials without exposing a provider's response or key", async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'private-test-key', region: '' },
      }),
      fetcher: async () =>
        new Response('Rejected private-test-key', { status: 401 }),
    })

    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({
      code: 'authentication',
      message: 'The API key was rejected. Check Shvyd settings.',
    })
  })

  test('keeps literal angle brackets separate from cached formatted translations', async () => {
    let calls = 0
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'test-key', region: '' },
      }),
      fetcher: async () => {
        calls++
        return Response.json({
          value: [{ translations: [{ text: '<p>Привіт</p>' }] }],
        })
      },
    })

    const request = { text: '<p>Hello</p>', target: 'uk' }
    expect(await service.translate(request)).toMatchObject({
      format: 'plain',
      cached: false,
    })

    expect(
      await service.translate({ ...request, format: 'html' })
    ).toMatchObject({ format: 'html', cached: false })

    expect(
      await service.translate({ ...request, format: 'html' })
    ).toMatchObject({ format: 'html', cached: true })

    expect(calls).toBe(2)
  })
})

describe('usage events', () => {
  const azureSettings = async (): Promise<Settings> => ({
    ...DEFAULT_SETTINGS,
    azure: { key: 'test-key', region: '' },
  })

  test('a provider call is reported once, and cache hits and shared requests are reported as reused', async () => {
    const events: unknown[] = []
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const service = createTranslationService({
      readSettings: azureSettings,
      onEvent: (event) => events.push(event),
      fetcher: async () => {
        await gate
        return Response.json({
          value: [{ translations: [{ text: 'Привіт' }] }],
        })
      },
    })

    const first = service.translate({ text: ' Hello ', target: 'uk' })
    const second = service.translate({ text: 'Hello', target: 'uk' })
    await Bun.sleep(0)
    release()
    await Promise.all([first, second])
    await service.translate({ text: 'Hello', target: 'uk' })

    expect(events).toEqual([
      {
        kind: 'provider-call',
        provider: 'azure',
        access: 'own-key',
        characters: 5,
        durationMs: expect.any(Number),
        outcome: 'success',
      },
      { kind: 'reused', provider: 'azure', access: 'own-key' },
      { kind: 'reused', provider: 'azure', access: 'own-key' },
    ])
  })

  test('a caller joining a shared call that fails is not counted as reused', async () => {
    const events: string[] = []
    let fail = () => {}
    const service = createTranslationService({
      readSettings: azureSettings,
      onEvent: (event) =>
        events.push(
          event.kind === 'reused' ? 'reused' : `call:${event.outcome}`
        ),
      fetcher: () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new TypeError('offline'))
        }),
    })

    const first = service.translate({ text: 'Hello', target: 'uk' })
    const second = service.translate({ text: 'Hello', target: 'uk' })
    await Bun.sleep(0)
    fail()

    const results = await Promise.allSettled([first, second])
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ])
    expect(events).toEqual(['call:failure'])
  })

  test('a failed provider call reports its category and HTTP status, never the response body', async () => {
    const events: unknown[] = []
    const service = createTranslationService({
      readSettings: async () => ({ ...DEFAULT_SETTINGS }),
      managedAzureUrl: 'https://relay.example/translate',
      onEvent: (event) => events.push(event),
      fetcher: async () => new Response('secret details', { status: 429 }),
    })

    await expect(
      service.translate({ text: 'Hi there', target: 'uk' })
    ).rejects.toMatchObject({ code: 'rate-limit' })
    expect(events).toEqual([
      {
        kind: 'provider-call',
        provider: 'azure',
        access: 'included',
        characters: 8,
        durationMs: expect.any(Number),
        outcome: 'failure',
        code: 'rate-limit',
        status: 429,
      },
    ])
  })

  test('requests rejected before a provider call are not counted', async () => {
    const events: unknown[] = []
    const service = createTranslationService({
      readSettings: async () => ({ ...DEFAULT_SETTINGS }),
      onEvent: (event) => events.push(event),
      fetcher: async () => Response.json({}),
    })

    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({ code: 'configuration' })
    expect(events).toEqual([])
  })

  test('a throwing usage listener cannot break translation', async () => {
    const service = createTranslationService({
      readSettings: azureSettings,
      onEvent: () => {
        throw new Error('storage failed')
      },
      fetcher: async () =>
        Response.json({ value: [{ translations: [{ text: 'Привіт' }] }] }),
    })

    expect(
      await service.translate({ text: 'Hello', target: 'uk' })
    ).toMatchObject({ text: 'Привіт' })
    expect(
      await service.translate({ text: 'Hello', target: 'uk' })
    ).toMatchObject({ cached: true })
  })
})

describe('included Azure access', () => {
  test('a relay that refuses this installation explains that included access is unavailable, not that a key was rejected', async () => {
    const service = createTranslationService({
      readSettings: async () => ({ ...DEFAULT_SETTINGS }),
      managedAzureUrl: 'https://relay.example/translate',
      fetcher: async () => new Response('Forbidden', { status: 403 }),
    })

    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({
      code: 'configuration',
      message:
        'Included Azure access is not available for this installation. Add your own Azure key in Shvyd settings.',
      status: 403,
    })
  })

  test('your own rejected key keeps the key message', async () => {
    const service = createTranslationService({
      readSettings: async () => ({
        ...DEFAULT_SETTINGS,
        azure: { key: 'wrong', region: '' },
      }),
      managedAzureUrl: 'https://relay.example/translate',
      fetcher: async () => new Response('', { status: 401 }),
    })

    await expect(
      service.translate({ text: 'Hello', target: 'uk' })
    ).rejects.toMatchObject({ code: 'authentication' })
  })
})
