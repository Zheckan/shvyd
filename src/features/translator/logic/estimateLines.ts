/** Average glyph width of 15 px system text, Latin and Cyrillic alike. */
const CHARACTER_WIDTH_PX = 7.4
const DEFAULT_FONT_SIZE_PX = 15
/** Translations into Ukrainian, Polish, or German usually run a little longer. */
const EXPANSION = 1.15
/** Beyond this the popup scrolls anyway, so more placeholder lines add nothing. */
const MAX_LINES = 16
const MIN_LAST_LINE = 0.3

export type LineEstimate = { lines: number; lastLineWidth: number }

/**
 * Predicts how many text lines a translation of `source` fills at `width` px
 * in `fontSize` px text.
 */
export function estimateLines(
  source: string,
  width: number,
  fontSize = DEFAULT_FONT_SIZE_PX
): LineEstimate {
  const characterWidth = (CHARACTER_WIDTH_PX * fontSize) / DEFAULT_FONT_SIZE_PX
  const perLine = Math.max(1, Math.floor(width / characterWidth))
  let lines = 0
  let lastLength = 0

  for (const paragraph of source.split(/\n+/)) {
    const length = Math.ceil(paragraph.trim().length * EXPANSION)

    if (length === 0) {
      continue
    }

    lines += Math.ceil(length / perLine)
    lastLength = length % perLine || perLine
  }

  if (lines === 0) {
    return { lines: 1, lastLineWidth: MIN_LAST_LINE }
  }

  if (lines > MAX_LINES) {
    return { lines: MAX_LINES, lastLineWidth: 1 }
  }

  return {
    lines,
    lastLineWidth: Math.max(MIN_LAST_LINE, lastLength / perLine),
  }
}
