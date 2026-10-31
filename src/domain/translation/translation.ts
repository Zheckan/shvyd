import {
  isLanguage,
  type Language,
  type Provider,
} from '@/domain/languages/languages'
import { isProvider } from '@/domain/settings/settings'
import { isRecord } from '@/utils/isRecord'

export const MAX_SELECTION_LENGTH = 10_000

export type TranslationFormat = 'plain' | 'html'

export type Translation = {
  text: string
  format: TranslationFormat
  target: Language
  provider: Provider
  cached: boolean
  durationMs: number
}

export type TranslationRequest = {
  text: string
  format?: TranslationFormat
  target: Language
  provider?: Provider
}

export type ErrorCode =
  | 'selection'
  | 'configuration'
  | 'authentication'
  | 'quota'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'provider'

export type TranslationAccess = 'included' | 'own-key'

export type TranslationEvent =
  | { kind: 'reused'; provider: Provider; access: TranslationAccess }
  | {
      kind: 'provider-call'
      provider: Provider
      access: TranslationAccess
      characters: number
      durationMs: number
      outcome: 'success'
    }
  | {
      kind: 'provider-call'
      provider: Provider
      access: TranslationAccess
      characters: number
      durationMs: number
      outcome: 'failure'
      code: ErrorCode
      status?: number
    }

export const ERROR_CODES: readonly ErrorCode[] = [
  'selection',
  'configuration',
  'authentication',
  'quota',
  'rate-limit',
  'timeout',
  'network',
  'provider',
]

export function isErrorCode(value: unknown): value is ErrorCode {
  return ERROR_CODES.some((code) => code === value)
}

export class TranslationError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'TranslationError'
  }
}

export function isTranslationFormat(
  value: unknown
): value is TranslationFormat {
  return value === 'plain' || value === 'html'
}

export function parseTranslationRequest(value: unknown): TranslationRequest {
  if (
    !isRecord(value) ||
    typeof value.text !== 'string' ||
    !isLanguage(value.target) ||
    (value.provider !== undefined && !isProvider(value.provider)) ||
    (value.format !== undefined && !isTranslationFormat(value.format))
  ) {
    throw new TranslationError(
      'selection',
      'Choose some text and a target language.'
    )
  }

  return {
    text: value.text,
    format: value.format ?? 'plain',
    target: value.target,
    provider: value.provider,
  }
}

export function parseTranslation(value: unknown): Translation {
  if (
    !isRecord(value) ||
    typeof value.text !== 'string' ||
    !isLanguage(value.target) ||
    !isProvider(value.provider) ||
    typeof value.cached !== 'boolean' ||
    typeof value.durationMs !== 'number' ||
    !Number.isFinite(value.durationMs) ||
    (value.format !== undefined && !isTranslationFormat(value.format))
  ) {
    throw new TranslationError(
      'provider',
      'The translation response could not be read.'
    )
  }

  return {
    text: value.text,
    format: value.format ?? 'plain',
    target: value.target,
    provider: value.provider,
    cached: value.cached,
    durationMs: value.durationMs,
  }
}
