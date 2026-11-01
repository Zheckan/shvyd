export const RESIZE_HANDLES = [
  'top',
  'right',
  'bottom',
  'left',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const

/** An edge or corner of the panel that the pointer drags. */
export type ResizeHandle = (typeof RESIZE_HANDLES)[number]

export type Size = { width: number; height: number }

export type Rect = Size & { x: number; y: number }

/** Which end of one axis the handle moves; the other end stays put. */
type Side = 'start' | 'end' | 'none'

type Span = { start: number; length: number }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function sideOf(handle: ResizeHandle, start: string, end: string): Side {
  if (handle.includes(start)) {
    return 'start'
  }

  if (handle.includes(end)) {
    return 'end'
  }

  return 'none'
}

function resizeSpan({
  span,
  side,
  delta,
  viewport,
  minimum,
  margin,
}: {
  span: Span
  side: Side
  delta: number
  viewport: number
  minimum: number
  margin: number
}): Span {
  if (side === 'end') {
    return {
      start: span.start,
      length: clamp(
        span.length + delta,
        minimum,
        viewport - margin - span.start
      ),
    }
  }

  if (side === 'start') {
    const end = span.start + span.length
    const length = clamp(span.length - delta, minimum, end - margin)

    return { start: end - length, length }
  }

  return span
}

/**
 * The panel's box after `handle` moved by `delta`. The opposite edges stay
 * put, so the panel grows only into the space on the handle's side, `margin`
 * px short of the viewport edge. The minimum size wins when less space is left.
 */
export function resizePanel({
  start,
  handle,
  delta,
  viewport,
  minimum,
  margin,
}: {
  start: Rect
  handle: ResizeHandle
  delta: { x: number; y: number }
  viewport: Size
  minimum: Size
  margin: number
}): Rect {
  const horizontal = resizeSpan({
    span: { start: start.x, length: start.width },
    side: sideOf(handle, 'left', 'right'),
    delta: delta.x,
    viewport: viewport.width,
    minimum: minimum.width,
    margin,
  })
  const vertical = resizeSpan({
    span: { start: start.y, length: start.height },
    side: sideOf(handle, 'top', 'bottom'),
    delta: delta.y,
    viewport: viewport.height,
    minimum: minimum.height,
    margin,
  })

  return {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.length,
    height: vertical.length,
  }
}
