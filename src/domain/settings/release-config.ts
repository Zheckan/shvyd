import { isRecord } from '@/utils/isRecord'

export type ReleaseConfig = { managedAzureUrl: string }

export function parseReleaseConfig(value: unknown): ReleaseConfig {
  if (!isRecord(value) || typeof value.managedAzureUrl !== 'string') {
    throw new Error('Invalid release configuration.')
  }

  if (!value.managedAzureUrl) {
    return { managedAzureUrl: '' }
  }

  const url = new URL(value.managedAzureUrl)

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Shared Azure requires an HTTPS endpoint without credentials or query parameters.'
    )
  }

  return { managedAzureUrl: url.href }
}
