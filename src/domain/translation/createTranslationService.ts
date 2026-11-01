import {
  getLanguage,
  isLanguage,
  type Provider,
} from '@/domain/languages/languages'
import { isProvider, type Settings } from '@/domain/settings/settings'
import { isRecord } from '@/utils/isRecord'
import { createRequestCache } from './createRequestCache'
import {
  errorForStatus,
  isAzureQuotaPayload,
  QUOTA_MESSAGE,
  TIMEOUT_MESSAGE,
} from './provider-errors'
import {
  isTranslationFormat,
  MAX_SELECTION_LENGTH,
  TranslationError,
  type Translation,
  type TranslationAccess,
  type TranslationEvent,
  type TranslationFormat,
  type TranslationRequest,
} from './translation'

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const AZURE_TRANSLATE_URL =
  'https://api.cognitive.microsofttranslator.com/translate?api-version=2026-06-06'
const REQUEST_TIMEOUT_MS = 15_000
const CACHE_LIMIT = 32
const CACHE_BYTE_LIMIT = 512 * 1024

/** Everything needed to send one translation to one provider. */
type ProviderCall = {
  provider: Provider
  access: TranslationAccess
  settings: Settings
  managedAzureUrl?: string
  text: string
  format: TranslationFormat
  target: string
  providerTarget: string
}

type HttpRequest = {
  url: string
  headers: Record<string, string>
  body: unknown
}

function httpRequest(call: ProviderCall): HttpRequest {
  const { provider, settings, text, format, providerTarget } = call

  if (call.access === 'included' && call.managedAzureUrl) {
    return {
      url: call.managedAzureUrl,
      headers: { 'Content-Type': 'application/json' },
      body: { text, format, target: call.target },
    }
  }

  if (provider === 'azure') {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': settings.azure.key,
    }

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

  return {
    url: `${settings.deepl.endpoint}/v2/translate`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `DeepL-Auth-Key ${settings.deepl.key}`,
    },
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

async function assertResponseOk(
  response: Response,
  provider: Provider,
  signal: AbortSignal
): Promise<void> {
  if (provider === 'azure' && response.status === 403) {
    let payload: unknown

    try {
      payload = await response.json()
    } catch {
      // Unknown or malformed errors keep the ordinary authentication classification.
    }

    if (signal.aborted) {
      throw new TranslationError('timeout', TIMEOUT_MESSAGE)
    }

    if (isAzureQuotaPayload(payload)) {
      throw new TranslationError('quota', QUOTA_MESSAGE, response.status)
    }
  }

  const error = errorForStatus(
    response.status,
    'The provider could not translate this selection. Try again.'
  )

  if (error) {
    throw error
  }
}

function unreadable(message: string): TranslationError {
  return new TranslationError('provider', message)
}

function readAzureText(payload: unknown): string {
  const first: unknown =
    isRecord(payload) && Array.isArray(payload.value)
      ? payload.value[0]
      : undefined

  if (!isRecord(first) || !Array.isArray(first.translations)) {
    throw unreadable('Azure returned an unreadable translation.')
  }

  const translation: unknown = first.translations[0]

  if (
    !isRecord(translation) ||
    typeof translation.text !== 'string' ||
    !translation.text.trim()
  ) {
    throw unreadable('Azure returned an empty translation.')
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
    throw unreadable('DeepL returned an empty or unreadable translation.')
  }

  return first.text
}

/** Sends one request and returns the provider's text, or throws a classified error. */
async function requestText(
  call: ProviderCall,
  fetcher: Fetcher,
  timeoutMs: number
): Promise<string> {
  const { url, headers, body } = httpRequest(call)
  const signal = AbortSignal.timeout(timeoutMs)
  let response: Response

  try {
    response = await fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof Error && error.name === 'TimeoutError')
    ) {
      throw new TranslationError('timeout', TIMEOUT_MESSAGE)
    }

    throw new TranslationError(
      'network',
      'Translation could not connect. Check your connection and try again.'
    )
  }

  try {
    await assertResponseOk(response, call.provider, signal)
  } catch (error) {
    // The relay refuses unknown extension IDs; there is no key for the person to fix.
    if (
      call.access === 'included' &&
      error instanceof TranslationError &&
      error.code === 'authentication'
    ) {
      throw new TranslationError(
        'configuration',
        'Included Azure access is not available for this installation. Add your own Azure key in Shvyd settings.',
        error.status
      )
    }

    throw error
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    if (signal.aborted) {
      throw new TranslationError('timeout', TIMEOUT_MESSAGE)
    }

    throw unreadable('The provider returned an unreadable response. Try again.')
  }

  return call.provider === 'azure'
    ? readAzureText(payload)
    : readDeepLText(payload)
}

/** Validates a request against current settings and decides where it goes. */
function planCall(
  request: TranslationRequest,
  settings: Settings,
  managedAzureUrl: string | undefined
): ProviderCall {
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

  const included =
    provider === 'azure' && !settings.azure.key && !!managedAzureUrl

  if (!settings[provider].key && !included) {
    throw new TranslationError(
      'configuration',
      'Add your provider API key in Shvyd settings.'
    )
  }

  return {
    provider,
    access: included ? 'included' : 'own-key',
    settings,
    managedAzureUrl,
    text: request.text.trim(),
    format,
    target: request.target,
    providerTarget,
  }
}

function cacheKey(call: ProviderCall): string {
  return JSON.stringify([
    call.provider,
    call.settings[call.provider],
    call.access === 'included',
    call.target,
    call.format,
    call.text,
  ])
}

export function createTranslationService({
  readSettings,
  fetcher = fetch,
  managedAzureUrl,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  onEvent,
}: {
  readSettings: () => Promise<Settings>
  fetcher?: Fetcher
  managedAzureUrl?: string
  requestTimeoutMs?: number
  onEvent?: (event: TranslationEvent) => void
}) {
  const encoder = new TextEncoder()
  const cache = createRequestCache<Translation>({
    maxEntries: CACHE_LIMIT,
    maxBytes: CACHE_BYTE_LIMIT,
    sizeOf: (key, value) =>
      encoder.encode(key).byteLength +
      encoder.encode(JSON.stringify(value)).byteLength,
  })

  function report(event: TranslationEvent): void {
    try {
      onEvent?.(event)
    } catch {
      // Usage tracking must never prevent a translation from appearing.
    }
  }

  /** One provider call, reported exactly once however many callers share it. */
  async function callProvider(call: ProviderCall): Promise<Translation> {
    const { provider, access } = call
    const started = performance.now()
    const characters = call.text.length

    try {
      const text = await requestText(call, fetcher, requestTimeoutMs)
      const durationMs = Math.round(performance.now() - started)
      report({
        kind: 'provider-call',
        provider,
        access,
        characters,
        durationMs,
        outcome: 'success',
      })

      return {
        text,
        format: call.format,
        provider,
        target: call.target,
        cached: false,
        durationMs,
      }
    } catch (error) {
      report({
        kind: 'provider-call',
        provider,
        access,
        characters,
        durationMs: Math.round(performance.now() - started),
        outcome: 'failure',
        code: error instanceof TranslationError ? error.code : 'provider',
        ...(error instanceof TranslationError && error.status !== undefined
          ? { status: error.status }
          : {}),
      })
      throw error
    }
  }

  async function translate(request: TranslationRequest): Promise<Translation> {
    const token = cache.token()
    const call = planCall(request, await readSettings(), managedAzureUrl)
    const { value, source } = await cache.load(
      cacheKey(call),
      () => callProvider(call),
      token
    )

    if (source !== 'fresh') {
      report({ kind: 'reused', provider: call.provider, access: call.access })
    }

    return source === 'cache'
      ? { ...value, cached: true, durationMs: 0 }
      : value
  }

  return { translate, clearCache: cache.clear }
}
