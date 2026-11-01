import { expect, test } from 'bun:test'
import { accessText, canTranslate, credentialAccess } from './credentialAccess'

test('each provider resolves to the access the settings page describes', () => {
  expect(credentialAccess('azure', true, false)).toBe('own-key')
  expect(credentialAccess('azure', false, true)).toBe('included')
  expect(credentialAccess('azure', false, false)).toBe('unconfigured')
  expect(credentialAccess('deepl', false, true)).toBe('needs-key')
  expect(canTranslate('included')).toBe(true)
  expect(canTranslate('needs-key')).toBe(false)
})

test('labels match the previous settings copy', () => {
  expect(accessText('deepl', 'own-key', true)).toEqual({
    card: 'Using your key',
    status: 'Key saved · not verified',
    summary: 'DeepL · your key',
  })
  expect(accessText('azure', 'own-key', false).status).toBe(
    'Key added · not verified'
  )
  expect(accessText('azure', 'included', true)).toEqual({
    card: 'Included Azure access',
    status: 'Included access · not verified',
    summary: 'Azure included',
  })
  expect(accessText('deepl', 'needs-key', true).summary).toBeUndefined()
})
