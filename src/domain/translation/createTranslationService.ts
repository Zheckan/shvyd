import { getLanguage, isLanguage } from '@/domain/languages/languages'
import { isProvider, type Settings } from '@/domain/settings/settings'
import { isRecord } from '@/utils/isRecord'
import {
  isTranslationFormat,
  MAX_SELECTION_LENGTH,
  TranslationError,
  type Translation,
  type TranslationRequest,
} from './translation'

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

function readAzureText(payload: unknown): string {
  const first: unknown =
    isRecord(payload) && Array.isArray(payload.value)
      ? payload.value[0]
      : undefined
  if (!isRecord(first) || !Array.isArray(first.translations)) {
    throw new TranslationError(
      'provider',
      'Azure returned an unreadable translation.'
    )
  }
  const translation: unknown = first.translations[0]
  if (
    !isRecord(translation) ||
    typeof translation.text !== 'string' ||
    !translation.text.trim()
  ) {
    throw new TranslationError(
      'provider',
      'Azure returned an empty translation.'
    )
  }
  return translation.text
}

function readDeepLText(payload: unknown): string {
  const first: unknown =
    isRecord(payload) && Array.isArray(payload.translations)
      ? payload.translations[0]
      : undefined
  if (
    !isRecord(first) ||
    typeof first.text !== 'string' ||
    !first.text.trim()
  ) {
    throw new TranslationError(
      'provider',
      'DeepL returned an empty or unreadable translation.'
    )
  }
  return first.text
}

export function createTranslationService({
  readSettings,
  fetcher = fetch,
}: {
  readSettings: () => Promise<Settings>
  fetcher?: Fetcher
}) {
  const cache = new Map<string, Translation>()
  async function translate(request: TranslationRequest): Promise<Translation> {
    const format = request.format ?? 'plain'
    if (
      !isLanguage(request.target) ||
      typeof request.text !== 'string' ||
      !isTranslationFormat(format) ||
      !request.text.trim() ||
      request.text.length > MAX_SELECTION_LENGTH
    ) {
      throw new TranslationError(
        'selection',
        'Select between 1 and 10,000 characters to translate.'
      )
    }
    const settings = await readSettings()
    const provider = request.provider ?? settings.provider
    if (!isProvider(provider))
      throw new TranslationError(
        'configuration',
        'Choose a translation provider.'
      )
    const providerTarget = getLanguage(request.target)?.[provider]
    if (!providerTarget)
      throw new TranslationError(
        'configuration',
        'This language is unavailable with the selected provider. Choose another language or provider.'
      )
    if (!settings[provider].key) {
      throw new TranslationError(
        'configuration',
        'Add your provider API key in Shvyd settings.'
      )
    }
    const text = request.text.trim()
    const cacheKey = JSON.stringify([provider, request.target, format, text])
    const cached = cache.get(cacheKey)
    if (cached) {
      cache.delete(cacheKey)
      cache.set(cacheKey, cached)
      return { ...cached, cached: true, durationMs: 0 }
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    let url: string
    let body: unknown
    if (provider === 'azure') {
      url =
        'https://api.cognitive.microsofttranslator.com/translate?api-version=2026-06-06'
      headers['Ocp-Apim-Subscription-Key'] = settings.azure.key
      if (settings.azure.region)
        headers['Ocp-Apim-Subscription-Region'] = settings.azure.region
      body = {
        inputs: [
          {
            text,
            ...(format === 'html' ? { textType: 'html' } : {}),
            targets: [{ language: providerTarget }],
          },
        ],
      }
    } else {
      url = `${settings.deepl.endpoint}/v2/translate`
      headers.Authorization = `DeepL-Auth-Key ${settings.deepl.key}`
      body = {
        text: [text],
        target_lang: providerTarget.toUpperCase(),
        model_type: 'latency_optimized',
        ...(format === 'html'
          ? { tag_handling: 'html', tag_handling_version: 'v1' }
          : {}),
      }
    }
    const started = performance.now()
    let response: Response
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new TranslationError(
        'network',
        'Translation could not connect. Check your connection and try again.'
      )
    }
    if (response.status === 401 || response.status === 403) {
      throw new TranslationError(
        'authentication',
        'The API key was rejected. Check Shvyd settings.'
      )
    }
    if (response.status === 429 || response.status === 456) {
      throw new TranslationError(
        'quota',
        "The provider's usage limit was reached. Try later or choose another provider in settings."
      )
    }
    if (!response.ok)
      throw new TranslationError(
        'provider',
        'The provider could not translate this selection. Try again.'
      )
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new TranslationError(
        'provider',
        'The provider returned an unreadable response. Try again.'
      )
    }
    const result: Translation = {
      text:
        provider === 'azure' ? readAzureText(payload) : readDeepLText(payload),
      format,
      provider,
      target: request.target,
      cached: false,
      durationMs: Math.round(performance.now() - started),
    }
    cache.set(cacheKey, result)
    if (cache.size > 32) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    return result
  }
  return { translate, clearCache: () => cache.clear() }
}
