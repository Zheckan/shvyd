import { DEFAULT_SETTINGS, parseSettings } from '@/domain/settings/settings'
import {
  createTranslationService,
  type Fetcher,
} from '@/domain/translation/createTranslationService'
import {
  parseTranslationRequest,
  TranslationError,
  type ErrorCode,
  type TranslationRequest,
} from '@/domain/translation/translation'
import { isRecord } from '@/utils/isRecord'

const MAX_REQUEST_BYTES = 65_000

/** Status the extension maps back to the same error category. Others become 502. */
const RELAY_STATUS: Partial<Record<ErrorCode, number>> = {
  'rate-limit': 429,
  timeout: 504,
  selection: 400,
  configuration: 400,
}

async function readRequest(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()

  if (!reader) {
    throw new Error('Missing request body.')
  }

  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''

  try {
    while (true) {
      const next = await reader.read()

      if (next.done) {
        break
      }

      bytes += next.value.byteLength

      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel()
        throw new Error('Request is too large.')
      }

      text += decoder.decode(next.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }

  return JSON.parse(text + decoder.decode())
}

export function createManagedAzureHandler({
  key,
  region,
  allowedOrigins,
  allowRequest,
  fetcher,
}: {
  key: string
  region: string
  allowedOrigins: string[]
  allowRequest: (request: Request) => Promise<boolean>
  fetcher?: Fetcher
}) {
  const settings = parseSettings({
    ...DEFAULT_SETTINGS,
    azure: { key, region },
  })
  const service = createTranslationService({
    readSettings: async () => settings,
    fetcher,
  })

  return async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get('origin')
    const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' })
    const allowed = !origin || allowedOrigins.includes(origin)

    if (origin && allowed) {
      headers.set('Access-Control-Allow-Origin', origin)
    }

    if (!allowed) {
      return new Response('Forbidden', { status: 403, headers })
    }

    if (new URL(request.url).pathname !== '/translate') {
      return new Response('Not found', { status: 404, headers })
    }

    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'POST')
      headers.set('Access-Control-Allow-Headers', 'Content-Type')

      return new Response(null, { status: 204, headers })
    }

    if (
      request.method !== 'POST' ||
      !request.headers.get('content-type')?.startsWith('application/json')
    ) {
      return new Response('Use a JSON POST request.', { status: 405, headers })
    }

    if (!(await allowRequest(request))) {
      return new Response('Shared Azure request limit reached.', {
        status: 429,
        headers,
      })
    }

    let translationRequest: TranslationRequest

    try {
      const value = await readRequest(request)

      if (
        !isRecord(value) ||
        (value.provider !== undefined && value.provider !== 'azure')
      ) {
        throw new Error('Use Azure translation.')
      }

      translationRequest = parseTranslationRequest({
        ...value,
        provider: 'azure',
      })
    } catch {
      return new Response('Invalid translation request.', {
        status: 400,
        headers,
      })
    }

    try {
      const translation = await service.translate(translationRequest)

      // Return only the translation, never upstream headers or server configuration.
      return Response.json(
        { value: [{ translations: [{ text: translation.text }] }] },
        { headers }
      )
    } catch (error) {
      const code = error instanceof TranslationError ? error.code : undefined

      if (code === 'quota') {
        // Preserve Azure's documented quota signal without forwarding its body.
        return Response.json(
          { error: { code: 403001 } },
          { status: 403, headers }
        )
      }

      return new Response('Shared Azure could not finish this request.', {
        status: (code && RELAY_STATUS[code]) ?? 502,
        headers,
      })
    }
  }
}
