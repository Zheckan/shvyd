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
  /** Called for each change the background announces to every tab. */
  onTabMessage(listener: (message: TabMessage) => void): void
}

/** Changes the background announces to every tab, so pages update without a reload. */
export type TabMessage =
  | { kind: 'site-hidden'; site: string }
  | { kind: 'site-shown'; site: string }
  | { kind: 'preferences-changed'; preferences: Preferences }

export function parseTabMessage(value: unknown): TabMessage | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  try {
    if (value.kind === 'site-hidden' || value.kind === 'site-shown') {
      return { kind: value.kind, site: parseSite(value.site) }
    }

    if (value.kind === 'preferences-changed') {
      return {
        kind: 'preferences-changed',
        preferences: parsePreferences(value.preferences),
      }
    }
  } catch {
    // Ignore malformed announcements.
  }

  return undefined
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
    onTabMessage: (listener) => {
      subscribe((value) => {
        const message = parseTabMessage(value)

        if (message) {
          listener(message)
        }
      })
    },
  }
}
