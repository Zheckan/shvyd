import { expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, publicPreferences } from '@/domain/settings/settings'
import { quickTargets, targetChange } from './quickTargets'

const preferences = publicPreferences(DEFAULT_SETTINGS)

test('offers preferred languages the provider supports, keeping the current one', () => {
  const options = quickTargets({
    ...preferences,
    favoriteLanguages: ['uk', 'en', 'pl'],
    target: 'de',
  })

  expect(options.map((option) => option.code)).toEqual(['uk', 'en', 'pl', 'de'])
  expect(options.find((option) => option.code === 'de')?.selected).toBe(true)
  expect(options[0]?.label).toBeTruthy()
})

test('a fixed default changes the default; a remembered language changes the last target', () => {
  expect(targetChange({ ...preferences, targetMode: 'fixed' }, 'pl')).toEqual({
    defaultTarget: 'pl',
  })
  expect(targetChange({ ...preferences, targetMode: 'last' }, 'pl')).toEqual({
    target: 'pl',
  })
})
