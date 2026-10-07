import {
  getLanguage,
  isLanguage,
  type Provider,
} from '@/domain/languages/languages'
import { isProvider, type Settings } from '@/domain/settings/settings'
import { isRecord } from '@/utils/isRecord'
import {
  isTranslationFormat,
  MAX_SELECTION_LENGTH,
  TranslationError,
  type Translation,
  type TranslationFormat,
  type TranslationRequest,
} from './translation'

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const AZURE_TRANSLATE_URL =
  'https://api.cognitive.microsofttranslator.com/translate?api-version=2026-06-06'
const REQUEST_TIMEOUT_MS = 15_000
const CACHE_LIMIT = 32
const CACHE_BYTE_LIMIT = 512 * 1024

type ProviderRequest = {
  url: string
  headers: Record<string, string>
  body: unknown
}

function providerRequest({
  provider,
  settings,
  text,
  format,
  providerTarget,
}: {
  provider: Provider
  settings: Settings
  text: string
  format: TranslationFormat
  providerTarget: string
}): ProviderRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (provider === 'azure') {
    headers['Ocp-Apim-Subscription-Key'] = settings.azure.key
    if (settings.azure.region) {
      headers['Ocp-Apim-Subscription-Region'] = settings.azure.region
    }

    return {
      url: AZURE_TRANSLATE_URL,
      headers,
      body: {
        inputs: [
          {
            text,
            ...(format === 'html' ? { textType: 'html' } : {}),
            targets: [{ language: providerTarget }],
          },
        ],
      },
    }
  }

  headers.Authorization = `DeepL-Auth-Key ${settings.deepl.key}`
  return {
    url: `${settings.deepl.endpoint}/v2/translate`,
    headers,
    body: {
      text: [text],
      target_lang: providerTarget.toUpperCase(),
      model_type: 'latency_optimized',
      ...(format === 'html'
        ? { tag_handling: 'html', tag_handling_version: 'v1' }
        : {}),
    },
  }
}

function assertResponseOk(response: Response): void {
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

  if (!response.ok) {
    throw new TranslationError(
      'provider',
      'The provider could not translate this selection. Try again.'
    )
  }
}

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
  managedAzureUrl,
}: {
  readSettings: () => Promise<Settings>
  fetcher?: Fetcher
  managedAzureUrl?: string
}) {
  const cache = new Map<string, { translation: Translation; bytes: number }>()
  const encoder = new TextEncoder()
  let cacheBytes = 0
  const inFlight = new Map<string, Promise<Translation>>()
  let cacheGeneration = 0

  async function translate(request: TranslationRequest): Promise<Translation> {
    const generation = cacheGeneration
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
    if (!isProvider(provider)) {
      throw new TranslationError(
        'configuration',
        'Choose a translation provider.'
      )
    }

    const providerTarget = getLanguage(request.target)?.[provider]
    if (!providerTarget) {
      throw new TranslationError(
        'configuration',
        'This language is unavailable with the selected provider. Choose another language or provider.'
      )
    }

    const sharedAzure =
      provider === 'azure' && !settings.azure.key && !!managedAzureUrl

    if (!settings[provider].key && !sharedAzure) {
      throw new TranslationError(
        'configuration',
        'Add your provider API key in Shvyd settings.'
      )
    }

    const text = request.text.trim()
    const cacheKey = JSON.stringify([
      provider,
      settings[provider],
      sharedAzure,
      request.target,
      format,
      text,
    ])
    const cached = cache.get(cacheKey)
    if (cached && generation === cacheGeneration) {
      cache.delete(cacheKey)
      cache.set(cacheKey, cached)
      return { ...cached.translation, cached: true, durationMs: 0 }
    }

    const pending = inFlight.get(cacheKey)
    if (pending && generation === cacheGeneration) {
      return pending
    }

    const task = (async () => {
      const directRequest = providerRequest({
        provider,
        settings,
        text,
        format,
        providerTarget,
      })
      const { url, headers, body } =
        sharedAzure && managedAzureUrl
          ? {
              url: managedAzureUrl,
              headers: { 'Content-Type': 'application/json' },
              body: { text, format, target: request.target },
            }
          : directRequest

      const started = performance.now()
      let response: Response
      try {
        response = await fetcher(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        throw new TranslationError(
          'network',
          'Translation could not connect. Check your connection and try again.'
        )
      }

      assertResponseOk(response)

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
          provider === 'azure'
            ? readAzureText(payload)
            : readDeepLText(payload),
        format,
        provider,
        target: request.target,
        cached: false,
        durationMs: Math.round(performance.now() - started),
      }

      if (generation === cacheGeneration) {
        const bytes =
          encoder.encode(cacheKey).byteLength +
          encoder.encode(JSON.stringify(result)).byteLength
        if (bytes <= CACHE_BYTE_LIMIT) {
          cache.set(cacheKey, { translation: result, bytes })
          cacheBytes += bytes
        }
      }
      while (cache.size > CACHE_LIMIT || cacheBytes > CACHE_BYTE_LIMIT) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) {
          break
        }
        cacheBytes -= cache.get(oldest)?.bytes ?? 0
        cache.delete(oldest)
      }

      return result
    })()
    if (generation === cacheGeneration) {
      inFlight.set(cacheKey, task)
    }

    try {
      return await task
    } finally {
      if (inFlight.get(cacheKey) === task) {
        inFlight.delete(cacheKey)
      }
    }
  }

  function clearCache(): void {
    cacheGeneration++
    cache.clear()
    cacheBytes = 0
    inFlight.clear()
  }

  return { translate, clearCache }
}
