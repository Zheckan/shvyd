import { expect, test } from 'bun:test'
import { unwrapResponse } from './translation-client'
import { TranslationError } from './translation'

test('errors without a translation code stay retryable generic failures', async () => {
  const error = await unwrapResponse({
    ok: false,
    message: 'Storage is busy. Try again.',
  }).catch((caught: unknown) => caught)

  expect(error).toBeInstanceOf(Error)
  expect(error).not.toBeInstanceOf(TranslationError)
  expect((error as Error).message).toBe('Storage is busy. Try again.')
})

test('coded failures keep their translation error classification', async () => {
  const error = await unwrapResponse({
    ok: false,
    code: 'quota',
    message: 'The usage limit was reached.',
  }).catch((caught: unknown) => caught)

  expect(error).toBeInstanceOf(TranslationError)
  expect((error as TranslationError).code).toBe('quota')
})
