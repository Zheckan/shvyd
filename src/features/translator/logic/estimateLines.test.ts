import { expect, test } from 'bun:test'
import { estimateLines } from './estimateLines'

const WIDTH = 376

test('a short title needs one partial line', () => {
  const estimate = estimateLines('Add team key validation', WIDTH)

  expect(estimate.lines).toBe(1)
  expect(estimate.lastLineWidth).toBeGreaterThan(0.3)
  expect(estimate.lastLineWidth).toBeLessThan(1)
})

test('longer text grows with its length, and each paragraph starts a new line', () => {
  const sentence = 'The release keeps settings in this browser. '

  const three = estimateLines(sentence.repeat(3), WIDTH).lines
  const six = estimateLines(sentence.repeat(6), WIDTH).lines

  expect(three).toBeGreaterThanOrEqual(3)
  expect(six).toBeGreaterThanOrEqual(three * 2 - 1)
  expect(estimateLines(`One.\n\nTwo.\nThree.`, WIDTH).lines).toBe(3)
})

test('very long text is capped, and empty text still shows one line', () => {
  expect(estimateLines('word '.repeat(2000), WIDTH)).toEqual({
    lines: 16,
    lastLineWidth: 1,
  })
  expect(estimateLines('   ', WIDTH).lines).toBe(1)
})
