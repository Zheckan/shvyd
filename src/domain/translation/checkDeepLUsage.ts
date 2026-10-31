import { parseSettings, type Settings } from '@/domain/settings/settings'
import { isRecord } from '@/utils/isRecord'
import type { Fetcher } from './createTranslationService'
import { errorForStatus } from './provider-errors'
import { TranslationError } from './translation'

const REQUEST_TIMEOUT_MS = 15_000

export type DeepLUsage = {
  characterCount: number
  characterLimit: number
  checkedAt: string
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Reads the account allowance. This request translates nothing and uses no characters. */
export async function checkDeepLUsage({
  settings,
  fetcher = fetch,
  now = () => new Date(),
}: {
  settings: Settings
  fetcher?: Fetcher
  now?: () => Date
}): Promise<DeepLUsage> {
  const { key, endpoint } = parseSettings(settings).deepl

  if (!key) {
    throw new TranslationError(
      'configuration',
      'Add your DeepL API key to check its allowance.'
    )
  }

  let response: Response

  try {
    response = await fetcher(`${endpoint}/v2/usage`, {
      method: 'GET',
      headers: { Authorization: `DeepL-Auth-Key ${key}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new TranslationError(
      'network',
      'DeepL could not be reached. Check your connection and try again.'
    )
  }

  const error = errorForStatus(
    response.status,
    'DeepL could not report the allowance. Try again.'
  )

  if (error) {
    throw error
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }

  if (
    !isRecord(payload) ||
    !isCount(payload.character_count) ||
    !isCount(payload.character_limit)
  ) {
    throw new TranslationError(
      'provider',
      'DeepL returned an unreadable allowance.'
    )
  }

  return {
    characterCount: payload.character_count,
    characterLimit: payload.character_limit,
    checkedAt: now().toISOString(),
  }
}

export function parseDeepLUsage(value: unknown): DeepLUsage {
  if (
    !isRecord(value) ||
    !isCount(value.characterCount) ||
    !isCount(value.characterLimit) ||
    typeof value.checkedAt !== 'string' ||
    Number.isNaN(Date.parse(value.checkedAt))
  ) {
    throw new Error('The DeepL allowance response could not be read.')
  }

  return {
    characterCount: value.characterCount,
    characterLimit: value.characterLimit,
    checkedAt: value.checkedAt,
  }
}
