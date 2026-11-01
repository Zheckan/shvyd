import type { Provider } from '@/domain/languages/languages'
import { parseSettings, type Settings } from '@/domain/settings/settings'
import { isRecord } from '@/utils/isRecord'
import {
  createTranslationService,
  type Fetcher,
} from './createTranslationService'
import type { TranslationEvent } from './translation'

export async function testConnection({
  settings,
  provider,
  fetcher,
  managedAzureUrl,
  onEvent,
}: {
  settings: Settings
  provider: Provider
  fetcher?: Fetcher
  managedAzureUrl?: string
  onEvent?: (event: TranslationEvent) => void
}): Promise<{ durationMs: number }> {
  const parsed = parseSettings(settings)
  const service = createTranslationService({
    readSettings: async () => parsed,
    fetcher,
    managedAzureUrl,
    onEvent,
  })
  const result = await service.translate({
    text: 'Hello',
    target: 'uk',
    provider,
  })

  return { durationMs: result.durationMs }
}

export function parseConnectionResult(value: unknown): { durationMs: number } {
  if (
    !isRecord(value) ||
    typeof value.durationMs !== 'number' ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0
  ) {
    throw new Error('The connection test response could not be read.')
  }

  return { durationMs: value.durationMs }
}
