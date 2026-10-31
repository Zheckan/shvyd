export type CacheSource = 'cache' | 'shared' | 'fresh'

/**
 * Bounded LRU cache that also shares identical in-flight loads.
 *
 * `clear()` starts a new generation: loads begun earlier still finish for their
 * callers but can no longer write to the cache or be joined by newer callers.
 */
export function createRequestCache<T>({
  maxEntries,
  maxBytes,
  sizeOf,
}: {
  maxEntries: number
  maxBytes: number
  sizeOf: (key: string, value: T) => number
}) {
  const entries = new Map<string, { value: T; bytes: number }>()
  const inFlight = new Map<string, Promise<T>>()
  let bytes = 0
  let generation = 0

  function store(key: string, value: T): void {
    const size = sizeOf(key, value)

    // Oversized values are returned normally but never evict useful entries.
    if (size > maxBytes) {
      return
    }

    entries.set(key, { value, bytes: size })
    bytes += size

    while (entries.size > maxEntries || bytes > maxBytes) {
      const oldest = entries.keys().next().value

      if (oldest === undefined) {
        break
      }

      bytes -= entries.get(oldest)?.bytes ?? 0
      entries.delete(oldest)
    }
  }

  async function load(
    key: string,
    loader: () => Promise<T>,
    token: number
  ): Promise<{ value: T; source: CacheSource }> {
    const current = token === generation
    const cached = entries.get(key)

    if (cached && current) {
      entries.delete(key)
      entries.set(key, cached)
      return { value: cached.value, source: 'cache' }
    }

    const pending = inFlight.get(key)

    if (pending && current) {
      return { value: await pending, source: 'shared' }
    }

    const task = loader()

    if (current) {
      inFlight.set(key, task)
    }

    try {
      const value = await task

      if (token === generation) {
        store(key, value)
      }

      return { value, source: 'fresh' }
    } finally {
      if (inFlight.get(key) === task) {
        inFlight.delete(key)
      }
    }
  }

  return {
    /** Capture before any await so a later `clear()` invalidates this request. */
    token: () => generation,
    load,
    clear(): void {
      generation++
      entries.clear()
      inFlight.clear()
      bytes = 0
    },
  }
}
