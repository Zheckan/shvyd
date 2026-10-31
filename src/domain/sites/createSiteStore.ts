import { createSerialQueue } from '@/utils/createSerialQueue'
import { isRecord } from '@/utils/isRecord'
import { parseSite, parseSiteList } from './sites'

export const MAX_HIDDEN_SITES = 500

export type SiteState = { version: 1; hidden: string[] }

function parseSiteState(value: unknown): SiteState {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Hidden sites could not be read.')
  }

  return { version: 1, hidden: parseSiteList(value.hidden) }
}

/** Sites where the selection button and popup stay off, newest last. */
export function createSiteStore({
  read,
  write,
}: {
  read: () => Promise<unknown>
  write: (state: SiteState) => Promise<void>
}) {
  const enqueue = createSerialQueue()

  async function load(): Promise<string[]> {
    const stored = await read()

    if (stored === undefined) {
      return []
    }

    try {
      return parseSiteState(stored).hidden
    } catch {
      // A damaged list must not hide Shvyd anywhere; start again with none.
      return []
    }
  }

  function update(change: (hidden: string[]) => string[]): Promise<void> {
    return enqueue(async () => {
      await write({ version: 1, hidden: change(await load()) })
    })
  }

  return {
    isHidden: async (site: string) => {
      const parsed = parseSite(site)

      return enqueue(async () => (await load()).includes(parsed))
    },
    list: () => enqueue(async () => [...(await load())].sort()),
    hide: async (site: string) => {
      const parsed = parseSite(site)

      return update((hidden) =>
        [...hidden.filter((item) => item !== parsed), parsed].slice(
          -MAX_HIDDEN_SITES
        )
      )
    },
    show: async (site: string) => {
      const parsed = parseSite(site)

      return update((hidden) => hidden.filter((item) => item !== parsed))
    },
  }
}
