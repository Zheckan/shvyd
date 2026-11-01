import { expect, test } from 'bun:test'
import { predictTextBox } from './predictTextBox'

const BOX = { padding: 24, lineHeight: 24, maxHeight: 480, expansion: 1.15 }

test('a one-line source predicts one line, at the measured last-line width', () => {
  expect(
    predictTextBox({ ...BOX, sourceHeight: 48, lastLineRatio: 0.4 })
  ).toEqual({ height: 48, lines: 1, lastLineWidth: 0.4 })
})

test('longer sources gain whole lines for translations that run longer', () => {
  // 10 source lines + round(1.5) = 12 lines.
  expect(
    predictTextBox({ ...BOX, sourceHeight: 264, lastLineRatio: 0.5 })
  ).toEqual({ height: 312, lines: 12, lastLineWidth: 0.5 })
})

test('paragraph spacing in formatted text is kept, not rounded away', () => {
  // 4 lines and a 12 px paragraph gap: one extra line, the gap stays.
  const prediction = predictTextBox({
    ...BOX,
    sourceHeight: 24 + 96 + 12,
    lastLineRatio: 0.7,
  })

  expect(prediction.height).toBe(24 + 120 + 12)
  expect(prediction.lines).toBe(6)
})

test('text taller than the box is capped at its scrolling height with full lines', () => {
  expect(
    predictTextBox({ ...BOX, sourceHeight: 2000, lastLineRatio: 0.2 })
  ).toEqual({ height: 480, lines: 19, lastLineWidth: 1 })
})

test('a box without a height limit, and an empty source, still predict sensibly', () => {
  expect(
    predictTextBox({
      ...BOX,
      maxHeight: Infinity,
      sourceHeight: 744,
      lastLineRatio: 1,
    }).lines
  ).toBe(35)
  expect(
    predictTextBox({ ...BOX, sourceHeight: 24, lastLineRatio: 0 })
  ).toEqual({ height: 48, lines: 1, lastLineWidth: 0.3 })
})
