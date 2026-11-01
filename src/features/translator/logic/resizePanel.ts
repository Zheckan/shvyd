export type Size = { width: number; height: number }

type Point = { x: number; y: number }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/**
 * The panel size after the resize grip moved by `delta`. The top-left corner
 * stays at `position`, so the panel may grow only into the space to its right
 * and below, `margin` px short of the viewport edge. The minimum wins when
 * less space is left.
 */
export function resizePanel({
  start,
  delta,
  position,
  viewport,
  minimum,
  margin,
}: {
  start: Size
  delta: Point
  position: Point
  viewport: Size
  minimum: Size
  margin: number
}): Size {
  return {
    width: clamp(
      start.width + delta.x,
      minimum.width,
      viewport.width - position.x - margin
    ),
    height: clamp(
      start.height + delta.y,
      minimum.height,
      viewport.height - position.y - margin
    ),
  }
}
