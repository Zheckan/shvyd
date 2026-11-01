import type { Settings } from '@/domain/settings/settings'

export type SaveState =
  { kind: 'pending' | 'saving' | 'saved' } | { kind: 'error'; message: string }

export function createSettingsSaver({
  save,
  onState,
}: {
  save: (value: Settings) => Promise<void>
  onState: (state: SaveState) => void
}) {
  let pending: Settings | undefined
  let running: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  async function drain(): Promise<void> {
    while (pending) {
      const value = pending
      pending = undefined
      onState({ kind: 'saving' })
      try {
        await save(value)
      } catch (error) {
        pending ??= value
        clearTimeout(timer)
        onState({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Settings could not be saved.',
        })

        return
      }

      if (!pending) {
        onState({ kind: 'saved' })
      }
    }
  }

  function flush(): Promise<void> {
    clearTimeout(timer)

    if (!running) {
      running = drain().finally(() => {
        running = undefined
      })
    }

    return running
  }

  return {
    schedule(value: Settings): void {
      pending = structuredClone(value)
      onState({ kind: 'pending' })
      clearTimeout(timer)
      timer = setTimeout(() => {
        void flush()
      }, 400)
    },
    flush,
    hasPending: () => !!pending || !!running,
  }
}
