import { expect, test } from 'bun:test'
import { resizePanel } from './resizePanel'

const VIEWPORT = { width: 1280, height: 900 }
const MINIMUM = { width: 220, height: 100 }
const MARGIN = 12

test('the panel grows and shrinks with the pointer', () => {
  const start = { width: 410, height: 200 }
  const position = { x: 100, y: 100 }

  expect(
    resizePanel({
      start,
      delta: { x: 90, y: 60 },
      position,
      viewport: VIEWPORT,
      minimum: MINIMUM,
      margin: MARGIN,
    })
  ).toEqual({ width: 500, height: 260 })
  expect(
    resizePanel({
      start,
      delta: { x: -50, y: -40 },
      position,
      viewport: VIEWPORT,
      minimum: MINIMUM,
      margin: MARGIN,
    })
  ).toEqual({ width: 360, height: 160 })
})

test('the panel never shrinks below its minimum or grows past the viewport', () => {
  const start = { width: 410, height: 200 }
  const position = { x: 800, y: 600 }

  expect(
    resizePanel({
      start,
      delta: { x: -1000, y: -1000 },
      position,
      viewport: VIEWPORT,
      minimum: MINIMUM,
      margin: MARGIN,
    })
  ).toEqual(MINIMUM)
  expect(
    resizePanel({
      start,
      delta: { x: 1000, y: 1000 },
      position,
      viewport: VIEWPORT,
      minimum: MINIMUM,
      margin: MARGIN,
    })
  ).toEqual({ width: 468, height: 288 })
})

test('near the edge the minimum wins over the space left', () => {
  expect(
    resizePanel({
      start: { width: 300, height: 150 },
      delta: { x: 0, y: 0 },
      position: { x: 1200, y: 850 },
      viewport: VIEWPORT,
      minimum: MINIMUM,
      margin: MARGIN,
    })
  ).toEqual(MINIMUM)
})
