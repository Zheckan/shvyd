import { expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { changedSettings } from './changedSettings'

test('only fields edited on the page are sent, whole provider records included', () => {
  const edited = {
    ...DEFAULT_SETTINGS,
    adaptToPage: !DEFAULT_SETTINGS.adaptToPage,
    azure: { ...DEFAULT_SETTINGS.azure, region: 'westeurope' },
  }

  expect(changedSettings(DEFAULT_SETTINGS, edited)).toEqual({
    adaptToPage: edited.adaptToPage,
    azure: edited.azure,
  })
  expect(changedSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({})
})
