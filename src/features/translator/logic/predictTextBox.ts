/** Narrowest placeholder for the last line, as a share of the text width. */
const MIN_LAST_LINE = 0.3

export type TextBoxPrediction = {
  /** Height of the whole text box, padding included. */
  height: number
  /** Placeholder lines to draw. */
  lines: number
  /** Width of the last placeholder line, as a share of the text width. */
  lastLineWidth: number
}

/**
 * Predicts the translation box from its source text measured in the same box.
 * Translations that run longer gain whole lines, so paragraph spacing in the
 * measurement stays exact, and the box scrolls beyond `maxHeight`.
 */
export function predictTextBox({
  sourceHeight,
  padding,
  lineHeight,
  maxHeight,
  expansion,
  lastLineRatio,
}: {
  /** Scroll height of the source text in the box, padding included. */
  sourceHeight: number
  /** Vertical padding of the box. */
  padding: number
  lineHeight: number
  /** `Infinity` when the box has no height limit. */
  maxHeight: number
  /** How much longer a translation usually runs than its source. */
  expansion: number
  /** Width of the source's last line, as a share of the text width. */
  lastLineRatio: number
}): TextBoxPrediction {
  const source = Math.max(lineHeight, sourceHeight - padding)
  // toFixed drops float noise: 10 lines × 0.15 is 1.4999… and would round down.
  const extraLines = Math.round(
    Number(((source / lineHeight) * (expansion - 1)).toFixed(6))
  )
  const height = Math.min(source + extraLines * lineHeight + padding, maxHeight)
  const capped = height === maxHeight

  return {
    height,
    lines: Math.max(1, Math.round((height - padding) / lineHeight)),
    lastLineWidth: capped
      ? 1
      : Math.max(MIN_LAST_LINE, Math.min(lastLineRatio, 1)),
  }
}
