import { parsePreferences, type Preferences } from '@/domain/settings/settings'
import { parseSite } from '@/domain/sites/sites'
import { isRecord } from '@/utils/isRecord'
import {
  isErrorCode,
  parseTranslation,
  TranslationError,
  type Translation,
  type TranslationRequest,
} from './translation'

export interface TranslationClient {
  preferences(): Promise<Preferences>
  updatePreferences(value: Partial<Preferences>): Promise<Preferences>
  translate(value: TranslationRequest): Promise<Translation>
  openSettings(): Promise<void>
  /** Whether Shvyd is turned off on this site. */
  siteHidden(site: string): Promise<boolean>
  hideSite(site: string): Promise<void>
  /** Called when Shvyd is turned off on a site from any tab. */
  onSiteHidden(listener: (site: string) => void): void
}

export async function unwrapResponse(value: unknown): Promise<unknown> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new Error('Shvyd could not connect. Reload this page and try again.')
  }

  if (!value.ok) {
    const message =
      typeof value.message === 'string'
        ? value.message
        : 'Translation could not finish. Try again.'

    if (isErrorCode(value.code)) {
      throw new TranslationError(value.code, message)
    }

    throw new Error(message)
  }

  return value.data
}

export function createClient(
  call: (request: unknown) => Promise<unknown>,
  subscribe: (listener: (message: unknown) => void) => void = () => undefined
): TranslationClient {
  const send = async (request: unknown) => unwrapResponse(await call(request))

  return {
    preferences: async () =>
      parsePreferences(await send({ kind: 'preferences' })),
    updatePreferences: async (value) =>
      parsePreferences(await send({ kind: 'update-preferences', value })),
    translate: async (value) =>
      parseTranslation(await send({ kind: 'translate', ...value })),
    openSettings: async () => {
      await send({ kind: 'open-settings' })
    },
    siteHidden: async (site) => {
      const data = await send({ kind: 'site-status', site })

      if (!isRecord(data) || typeof data.hidden !== 'boolean') {
        throw new Error('The site status could not be read.')
      }

      return data.hidden
    },
    hideSite: async (site) => {
      await send({ kind: 'hide-site', site })
    },
    onSiteHidden: (listener) => {
      subscribe((message) => {
        if (isRecord(message) && message.kind === 'site-hidden') {
          try {
            listener(parseSite(message.site))
          } catch {
            // Ignore malformed notifications.
          }
        }
      })
    },
  }
}
