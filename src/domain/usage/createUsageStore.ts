import type { TranslationEvent } from '@/domain/translation/translation'
import {
  createUsageState,
  exportDiagnostics,
  parseUsageState,
  pruneUsage,
  recordUsage,
  usageView,
  type DiagnosticsExport,
  type UsageState,
  type UsageView,
} from './usage'

export function createUsageStore({
  read,
  write,
  now = () => new Date(),
  randomId = () => crypto.randomUUID(),
  version,
}: {
  read: () => Promise<unknown>
  write: (state: UsageState) => Promise<void>
  now?: () => Date
  randomId?: () => string
  version: string
}) {
  let queue: Promise<unknown> = Promise.resolve()

  async function load(): Promise<UsageState> {
    const stored = await read()

    if (stored === undefined) {
      return createUsageState(now())
    }

    try {
      return pruneUsage(parseUsageState(stored), now())
    } catch {
      // Damaged counters are not worth blocking translation; start a fresh record.
      return createUsageState(now())
    }
  }

  // Storage is the source of truth, so a restarted worker continues from saved counts.
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation)
    queue = result.catch(() => undefined)
    return result
  }

  function update(change: (state: UsageState) => UsageState): Promise<void> {
    return enqueue(async () => {
      await write(change(await load()))
    })
  }

  return {
    record: (event: TranslationEvent) =>
      update((state) =>
        recordUsage(state, event, {
          now: now(),
          makeReference: randomId,
          version,
        })
      ),
    view: (): Promise<UsageView> =>
      enqueue(async () => usageView(await load())),
    exportDiagnostics: (): Promise<DiagnosticsExport> =>
      enqueue(async () =>
        exportDiagnostics(await load(), { now: now(), version })
      ),
    clearUsage: () =>
      update((state) => ({
        ...state,
        trackingSince: createUsageState(now()).trackingSince,
        days: [],
      })),
    clearDiagnostics: () =>
      update((state) => ({
        ...state,
        diagnostics: { ...state.diagnostics, records: [] },
      })),
    setDiagnostics: (enabled: boolean) =>
      update((state) => ({
        ...state,
        diagnostics: {
          enabled,
          records: enabled ? state.diagnostics.records : [],
        },
      })),
  }
}
