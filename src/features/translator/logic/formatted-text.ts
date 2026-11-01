import {
  MAX_SELECTION_LENGTH,
  type Translation,
  type TranslationFormat,
} from '@/domain/translation/translation'

export type SelectedContent = { text: string; format: TranslationFormat }

const TAGS = new Set([
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'br',
  'strong',
  'em',
  'u',
  's',
  'sup',
  'sub',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'dl',
  'dt',
  'dd',
])

const OMIT = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'math',
  'img',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'input',
  'select',
  'textarea',
  'canvas',
  'video',
  'audio',
])

const BLOCKS =
  'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,pre,blockquote,table,tr,th,td,dl,dt,dd'
const MAX_NODES = 4_000
const MAX_DEPTH = 40

const TAG_ALIASES: Record<string, string> = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
}

const NUMBER_ATTRIBUTES: Record<string, string[]> = {
  ol: ['start'],
  li: ['value'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
}

function numberAttribute(element: Element, name: string): number | undefined {
  const value = element.getAttribute(name)

  return value !== null && /^-?\d{1,6}$/.test(value) ? Number(value) : undefined
}

function safeElement(
  source: Element,
  tag: string,
  preserveCode: boolean
): HTMLElement {
  const result = document.createElement(tag)

  for (const name of NUMBER_ATTRIBUTES[tag] ?? []) {
    const value = numberAttribute(source, name)
    if (
      value !== undefined &&
      (!name.endsWith('span') || (value >= 1 && value <= 100))
    ) {
      result.setAttribute(name, String(value))
    }
  }

  if (tag === 'ol' && source.hasAttribute('reversed')) {
    result.setAttribute('reversed', '')
  }

  if (preserveCode && (tag === 'pre' || tag === 'code')) {
    result.setAttribute('translate', 'no')
    result.className = 'notranslate'
  }

  return result
}

function tagName(element: Element): string {
  const tag = element.localName.toLowerCase()

  return TAG_ALIASES[tag] ?? tag
}

/** The number of a list's first item and whether numbering counts down. */
function listNumbering(
  list: Element,
  items: Element[]
): { first: number; step: 1 | -1 } {
  const step = list.hasAttribute('reversed') ? -1 : 1
  const first =
    numberAttribute(list, 'start') ?? (step === -1 ? items.length : 1)

  return { first, step }
}

/**
 * Pages such as YouTube descriptions draw newline characters as line breaks
 * with `white-space: pre-wrap`. In HTML they would collapse into spaces.
 * Preformatted blocks are copied as `pre` and keep their newlines themselves.
 */
function drawsNewlines(text: Text): boolean {
  const element = text.parentElement

  if (!element || element.closest('pre,code')) {
    return false
  }

  const collapse = getComputedStyle(element).getPropertyValue(
    'white-space-collapse'
  )

  return (
    collapse === 'preserve' ||
    collapse === 'preserve-breaks' ||
    collapse === 'break-spaces'
  )
}

function appendText(parent: Node, text: string, newlinesAsBreaks: boolean) {
  if (!newlinesAsBreaks) {
    parent.appendChild(document.createTextNode(text))
    return
  }

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (index > 0) {
      parent.appendChild(document.createElement('br'))
    }

    if (line) {
      parent.appendChild(document.createTextNode(line))
    }
  }
}

/** Copy only selected text and inert formatting. Page attributes never enter the request. */
export function captureSelection(
  range: Range,
  plainText: string
): SelectedContent {
  const fallback: SelectedContent = { text: plainText, format: 'plain' }
  const container = document.createElement('div')
  let visited = 0

  try {
    let source = range.commonAncestorContainer
    if (source instanceof Text) {
      source = source.parentElement ?? source
    }

    if (source instanceof Element) {
      source = source.closest(BLOCKS) ?? source
      if (source instanceof Element) {
        source = source.closest('table') ?? source.closest('ul,ol') ?? source
      }
    }

    function copy(node: Node, parent: Node, depth: number): void {
      if (++visited > MAX_NODES || depth > MAX_DEPTH) {
        throw new Error('Selection structure is too large.')
      }

      if (!range.intersectsNode(node)) {
        return
      }

      if (node instanceof Text) {
        const start = node === range.startContainer ? range.startOffset : 0
        const end = node === range.endContainer ? range.endOffset : node.length
        appendText(parent, node.data.slice(start, end), drawsNewlines(node))
        return
      }

      if (!(node instanceof Element)) {
        return
      }

      let tag = tagName(node)
      if (OMIT.has(tag)) {
        return
      }

      const style = getComputedStyle(node)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse'
      ) {
        return
      }

      if (
        !TAGS.has(tag) &&
        !style.display.startsWith('inline') &&
        style.display !== 'contents'
      ) {
        tag = 'div'
      }

      const output = TAGS.has(tag)
        ? safeElement(node, tag, true)
        : document.createDocumentFragment()
      if (tag === 'ol') {
        const items = [...node.children].filter(
          (child) => child.localName === 'li'
        )
        const { first, step } = listNumbering(node, items)
        let value = first

        for (const item of items) {
          if (++visited > MAX_NODES) {
            throw new Error('Selection structure is too large.')
          }

          value = numberAttribute(item, 'value') ?? value
          if (range.intersectsNode(item)) {
            if (output instanceof Element) {
              output.setAttribute('start', String(value))
            }

            break
          }

          value += step
        }
      }

      for (const child of node.childNodes) {
        copy(child, output, depth + 1)
      }

      if (tag === 'br' || output.textContent?.trim()) {
        if (
          tag !== 'u' &&
          style.textDecorationLine.split(/\s+/).includes('underline')
        ) {
          const underline = document.createElement('u')
          underline.append(output)
          parent.appendChild(underline)
        } else {
          parent.appendChild(output)
        }
      }
    }

    copy(source, container, 0)

    // A complete wrapper is required by Azure. Excess markup falls back to the bounded plain selection.
    const html = container.outerHTML
    if (!container.childElementCount || html.length > MAX_SELECTION_LENGTH) {
      return fallback
    }

    return { text: html, format: 'html' }
  } catch {
    return fallback
  }
}

function readableText(node: Node): string {
  if (node instanceof Text) {
    return node.data
  }

  if (!(node instanceof Element)) {
    return [...node.childNodes].map(readableText).join('')
  }

  const tag = node.localName
  if (tag === 'br') {
    return '\n'
  }

  if (tag === 'ul' || tag === 'ol') {
    const items = [...node.children].filter((child) => child.localName === 'li')
    const { first, step } = listNumbering(node, items)
    let value = first

    const lines = items.map((item) => {
      value = numberAttribute(item, 'value') ?? value
      const marker = tag === 'ol' ? `${value}. ` : '• '
      value += step

      return marker + readableText(item).trim()
    })

    return `\n${lines.join('\n')}\n\n`
  }

  if (tag === 'tr') {
    const cells = [...node.children].map((child) => readableText(child).trim())

    return `${cells.join('\t')}\n`
  }

  const text = [...node.childNodes].map(readableText).join('')
  if (node.matches('p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,dl,dt,dd,table')) {
    return `${text}\n\n`
  }

  return text
}

/** Provider HTML is untrusted. Parse in an inert template, then create allowed nodes afresh. */
export function renderTranslation(
  output: HTMLElement,
  translation: Pick<Translation, 'text' | 'format'>
): string {
  output.classList.toggle('formatted', translation.format === 'html')
  if (translation.format === 'plain') {
    output.textContent = translation.text
    return translation.text
  }

  const template = document.createElement('template')
  template.innerHTML = translation.text
  const fragment = document.createDocumentFragment()
  let visited = 0

  function copy(node: Node, parent: Node, depth: number): void {
    if (++visited > MAX_NODES || depth > MAX_DEPTH) {
      throw new Error('The translation structure is too large.')
    }

    if (node instanceof Text) {
      parent.appendChild(document.createTextNode(node.data))
      return
    }

    if (!(node instanceof Element)) {
      return
    }

    const tag = tagName(node)
    if (OMIT.has(tag)) {
      return
    }

    const safe = TAGS.has(tag)
      ? safeElement(node, tag, false)
      : document.createDocumentFragment()
    for (const child of node.childNodes) {
      copy(child, safe, depth + 1)
    }

    parent.appendChild(safe)
  }

  for (const node of template.content.childNodes) {
    copy(node, fragment, 0)
  }

  const text = readableText(fragment)
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!text) {
    throw new Error('The provider returned an empty translation.')
  }

  output.replaceChildren(fragment)

  return text
}
