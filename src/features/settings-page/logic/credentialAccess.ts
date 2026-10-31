import type { Provider } from '@/domain/languages/languages'

/** How a provider can be used right now, given its key field and the relay. */
export type CredentialAccess =
  'own-key' | 'included' | 'unconfigured' | 'needs-key'

type AccessText = {
  /** Short label on the provider card. */
  card: string
  /** Connection line before the user runs a test. */
  status: string
  /** Part of the API keys summary, if this access counts as configured. */
  summary?: string
}

const NAMES: Record<Provider, string> = { azure: 'Azure', deepl: 'DeepL' }

export function credentialAccess(
  provider: Provider,
  hasKey: boolean,
  managedAzureAvailable: boolean
): CredentialAccess {
  if (hasKey) {
    return 'own-key'
  }

  if (provider === 'deepl') {
    return 'needs-key'
  }

  return managedAzureAvailable ? 'included' : 'unconfigured'
}

export function canTranslate(access: CredentialAccess): boolean {
  return access === 'own-key' || access === 'included'
}

export function accessText(
  provider: Provider,
  access: CredentialAccess,
  keySaved: boolean
): AccessText {
  switch (access) {
    case 'own-key':
      return {
        card: 'Using your key',
        status: `${keySaved ? 'Key saved' : 'Key added'} · not verified`,
        summary: `${NAMES[provider]} · your key`,
      }
    case 'included':
      return {
        card: 'Included Azure access',
        status: 'Included access · not verified',
        summary: 'Azure included',
      }
    case 'unconfigured':
      return {
        card: 'Shared access not configured',
        status: 'Shared access not configured',
      }
    case 'needs-key':
      return {
        card: 'Requires your own key',
        status: 'Add your own key to enable',
      }
  }
}
