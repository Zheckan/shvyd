import { MAX_SELECTION_LENGTH } from '@/domain/translation/translation'
import { captureSelection, type SelectedContent } from './formatted-text'

/** Last place the pointer was released on the page, in viewport coordinates. */
export type PagePoint = { x: number; y: number }

export type PageSelection = {
  text: string
  content: SelectedContent
  element: Element
  /** Where to place the button and popup; read again on every layout. */
  anchor: () => DOMRect
  /** Where the pointer was released over the selection, if it was. */
  pointer: () => DOMRect | undefined
  identity: Range | { field: Element; start: number; end: number }
}

export type SelectionResult =
  | { kind: 'none' }
  | { kind: 'blocked' }
  | { kind: 'too-long' }
  | { kind: 'selected'; selection: PageSelection }

// Other input types hold passwords, numbers, addresses, or codes, not prose.
const TRANSLATABLE_INPUT_TYPES = new Set(['text', 'search'])
const POINTER_SLACK_PX = 8

function hasSize(rect: DOMRect | undefined): rect is DOMRect {
  return !!rect && (rect.width > 0 || rect.height > 0)
}

function pointerWithin(
  element: Element,
  point: PagePoint | undefined
): DOMRect | undefined {
  if (!point) {
    return undefined
  }

  const box = element.getBoundingClientRect()
  const inside =
    point.x >= box.left - POINTER_SLACK_PX &&
    point.x <= box.right + POINTER_SLACK_PX &&
    point.y >= box.top - POINTER_SLACK_PX &&
    point.y <= box.bottom + POINTER_SLACK_PX

  return inside ? new DOMRect(point.x, point.y, 0, 0) : undefined
}

function checkedText(text: string): SelectionResult | undefined {
  if (!text) {
    return { kind: 'none' }
  }

  if (text.length > MAX_SELECTION_LENGTH) {
    return { kind: 'too-long' }
  }

  return undefined
}

/**
 * Text fields keep their selection out of the document's ranges, so their
 * text comes from the value and their position from the pointer or the field.
 */
function readField(
  field: HTMLInputElement | HTMLTextAreaElement,
  point: PagePoint | undefined
): SelectionResult {
  if (
    field instanceof HTMLInputElement &&
    !TRANSLATABLE_INPUT_TYPES.has(field.type)
  ) {
    return { kind: 'blocked' }
  }

  const start = field.selectionStart
  const end = field.selectionEnd

  if (start === null || end === null || start === end) {
    return { kind: 'none' }
  }

  const text = field.value.slice(start, end).trim()

  return (
    checkedText(text) ?? {
      kind: 'selected',
      selection: {
        text,
        content: { text, format: 'plain' },
        element: field,
        anchor: () =>
          pointerWithin(field, point) ?? field.getBoundingClientRect(),
        pointer: () => pointerWithin(field, point),
        identity: { field, start, end },
      },
    }
  )
}

function readRange(point: PagePoint | undefined): SelectionResult {
  const selection = window.getSelection()

  if (!selection || !selection.rangeCount) {
    return { kind: 'none' }
  }

  const text = selection.toString().trim()
  const problem = checkedText(text)

  if (problem) {
    return problem
  }

  const range = selection.getRangeAt(0).cloneRange()
  const ancestor = range.commonAncestorContainer
  const element =
    ancestor instanceof Element ? ancestor : ancestor.parentElement

  if (!element) {
    return { kind: 'none' }
  }

  if (element.closest('input, textarea')) {
    return { kind: 'blocked' }
  }

  return {
    kind: 'selected',
    selection: {
      text,
      content: captureSelection(range, text),
      element,
      // A page that re-renders the selected text leaves the range without a box.
      anchor: () => {
        const rects = range.getClientRects()
        const last = rects[rects.length - 1]

        if (hasSize(last)) {
          return last
        }

        const bounds = range.getBoundingClientRect()

        if (hasSize(bounds)) {
          return bounds
        }

        return pointerWithin(element, point) ?? element.getBoundingClientRect()
      },
      pointer: () => pointerWithin(element, point),
      identity: range,
    },
  }
}

export function readPageSelection(
  point: PagePoint | undefined
): SelectionResult {
  const active = document.activeElement

  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    return readField(active, point)
  }

  return readRange(point)
}

export function isSameSelection(a: PageSelection, b: PageSelection): boolean {
  if (a.text !== b.text) {
    return false
  }

  if (a.identity instanceof Range && b.identity instanceof Range) {
    return (
      a.identity.compareBoundaryPoints(Range.START_TO_START, b.identity) ===
        0 &&
      a.identity.compareBoundaryPoints(Range.END_TO_END, b.identity) === 0
    )
  }

  if (!(a.identity instanceof Range) && !(b.identity instanceof Range)) {
    return (
      a.identity.field === b.identity.field &&
      a.identity.start === b.identity.start &&
      a.identity.end === b.identity.end
    )
  }

  return false
}
