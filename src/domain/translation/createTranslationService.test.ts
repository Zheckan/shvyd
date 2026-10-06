import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { createTranslationService } from './createTranslationService'

describe('selected-text translation', () => {
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
