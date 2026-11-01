import { expect, test } from 'bun:test'
import { resizePanel, type Rect, type ResizeHandle } from './resizePanel'

const VIEWPORT = { width: 1280, height: 900 }
const MINIMUM = { width: 220, height: 100 }
const MARGIN = 12
const START: Rect = { x: 300, y: 200, width: 410, height: 300 }

function resize(handle: ResizeHandle, x: number, y: number, start = START) {
  return resizePanel({
    start,
    handle,
    delta: { x, y },
    viewport: VIEWPORT,
    minimum: MINIMUM,
    margin: MARGIN,
  })
}

test('the bottom-right corner grows the panel and keeps its top-left corner', () => {
  expect(resize('bottom-right', 90, 60)).toEqual({
    x: 300,
    y: 200,
    width: 500,
    height: 360,
  })
})

test('the top-left corner moves that corner and keeps the opposite one', () => {
  expect(resize('top-left', -50, -40)).toEqual({
    x: 250,
    y: 160,
    width: 460,
    height: 340,
  })
})

test('an edge changes only its own dimension', () => {
  expect(resize('left', 30, 70)).toEqual({ ...START, x: 330, width: 380 })
  expect(resize('top', 30, 70)).toEqual({ ...START, y: 270, height: 230 })
  expect(resize('right', 30, 70)).toEqual({ ...START, width: 440 })
  expect(resize('bottom', 30, 70)).toEqual({ ...START, height: 370 })
})

test('the mixed corners pair one start edge with one end edge', () => {
  expect(resize('top-right', 20, -20)).toEqual({
    x: 300,
    y: 180,
    width: 430,
    height: 320,
  })
  expect(resize('bottom-left', -20, 20)).toEqual({
    x: 280,
    y: 200,
    width: 430,
    height: 320,
  })
})

test('the panel never shrinks below its minimum', () => {
  expect(resize('bottom-right', -1000, -1000)).toEqual({
    x: 300,
    y: 200,
    ...MINIMUM,
  })
  expect(resize('top-left', 1000, 1000)).toEqual({
    x: 490,
    y: 400,
    ...MINIMUM,
  })
})

test('the panel never grows past the viewport margin', () => {
  expect(resize('bottom-right', 5000, 5000)).toEqual({
    x: 300,
    y: 200,
    width: 968,
    height: 688,
  })
  expect(resize('top-left', -5000, -5000)).toEqual({
    x: 12,
    y: 12,
    width: 698,
    height: 488,
  })
})

test('near the edge the minimum wins over the space left', () => {
  expect(
    resize('bottom-right', 0, 0, { x: 1200, y: 850, width: 300, height: 150 })
  ).toEqual({ x: 1200, y: 850, ...MINIMUM })
})
