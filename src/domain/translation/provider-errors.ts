import { isRecord } from '@/utils/isRecord'
import { TranslationError, type ErrorCode } from './translation'

export const QUOTA_MESSAGE =
  "The provider's character allowance is exhausted. Check your quota or choose another provider in settings."

export const TIMEOUT_MESSAGE = 'Translation took too long. Try again.'

const STATUS_ERRORS: Record<number, [ErrorCode, string]> = {
  401: ['authentication', 'The API key was rejected. Check Shvyd settings.'],
  403: ['authentication', 'The API key was rejected. Check Shvyd settings.'],
  429: [
    'rate-limit',
    'Too many translation requests. Wait a moment and try again.',
  ],
  456: ['quota', QUOTA_MESSAGE],
  504: ['timeout', TIMEOUT_MESSAGE],
}

/** Classifies an HTTP status from Azure, DeepL, or the shared relay. */
export function errorForStatus(
  status: number,
  fallbackMessage: string
): TranslationError | undefined {
  if (status >= 200 && status < 300) {
    return undefined
  }

  const [code, message] = STATUS_ERRORS[status] ?? ['provider', fallbackMessage]

  return new TranslationError(code, message, status)
}

/** Azure reports an exhausted allowance as HTTP 403 with error code 403001. */
export function isAzureQuotaPayload(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    isRecord(payload.error) &&
    (payload.error.code === 403001 || payload.error.code === '403001')
  )
}
