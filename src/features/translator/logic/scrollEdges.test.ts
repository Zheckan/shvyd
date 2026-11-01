import { expect, test } from 'bun:test'
import { scrollEdges } from './scrollEdges'

test('text that fits hides nothing', () => {
  expect(
    scrollEdges({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 })
  ).toEqual({ above: false, below: false })
})

test('long text at the top hides only what is below', () => {
  expect(
    scrollEdges({ scrollTop: 0, scrollHeight: 900, clientHeight: 480 })
  ).toEqual({ above: false, below: true })
})

test('scrolled text hides lines on both edges', () => {
  expect(
    scrollEdges({ scrollTop: 120, scrollHeight: 900, clientHeight: 480 })
  ).toEqual({ above: true, below: true })
})

test('fractional scroll positions at the end count as the end', () => {
  expect(
    scrollEdges({ scrollTop: 419.6, scrollHeight: 900, clientHeight: 480 })
  ).toEqual({ above: true, below: false })
})
