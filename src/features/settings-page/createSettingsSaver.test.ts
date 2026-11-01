import { expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, type Settings } from '@/domain/settings/settings'
import { createSettingsSaver, type SaveState } from './createSettingsSaver'

test('autosave keeps the newest edit when a previous save is still running', async () => {
  const writes: Settings[] = []
  const first = Promise.withResolvers<void>()
  const saver = createSettingsSaver({
    save: async (value) => {
      writes.push(value)

      if (writes.length === 1) {
        await first.promise
      }
    },
    onState: () => {},
  })

  saver.schedule({ ...DEFAULT_SETTINGS, target: 'en' })
  const saving = saver.flush()
  saver.schedule({ ...DEFAULT_SETTINGS, target: 'pl' })
  saver.schedule({ ...DEFAULT_SETTINGS, target: 'de' })

  expect(writes.map((value) => value.target)).toEqual(['en'])
  first.resolve()
  await saving

  expect(writes.map((value) => value.target)).toEqual(['en', 'de'])
  expect(saver.hasPending()).toBe(false)
})

test('a failed save stays unsaved and can be retried without retyping', async () => {
  const states: SaveState[] = []
  let attempts = 0
  const saver = createSettingsSaver({
    save: async () => {
      attempts += 1

      if (attempts === 1) {
        throw new Error('Storage is unavailable.')
      }
    },
    onState: (state) => states.push(state),
  })

  saver.schedule({ ...DEFAULT_SETTINGS, target: 'pl' })
  await saver.flush()

  expect(states.at(-1)).toEqual({
    kind: 'error',
    message: 'Storage is unavailable.',
  })
  expect(saver.hasPending()).toBe(true)

  await saver.flush()

  expect(attempts).toBe(2)
  expect(states.at(-1)).toEqual({ kind: 'saved' })
  expect(saver.hasPending()).toBe(false)
})
