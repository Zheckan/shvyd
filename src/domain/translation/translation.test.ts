import { expect, test } from 'bun:test'
import { parseTranslation, parseTranslationRequest } from './translation'

test('validates formatting at message boundaries and accepts older plain-text responses', () => {
  expect(parseTranslationRequest({ text: 'Hello', target: 'uk' }).format).toBe(
    'plain'
  )
  expect(() =>
    parseTranslationRequest({
      text: 'Hello',
      target: 'uk',
      format: 'markdown',
    })
  ).toThrow()
  expect(() =>
    parseTranslation({
      text: 'Hello',
      target: 'uk',
      provider: 'azure',
      cached: false,
      durationMs: 1,
      format: 'markdown',
    })
  ).toThrow()
  expect(
    parseTranslation({
      text: 'Hello',
      target: 'uk',
      provider: 'azure',
      cached: false,
      durationMs: 1,
    }).format
  ).toBe('plain')
})
