type RGB = readonly [number, number, number]
type RGBA = readonly [number, number, number, number]

export type PageStyle = {
  background: string
  foreground: string
  accent: string
  border: string
  radius: string
  shadow: string
  /** Native controls and scroll bars follow the popup's light or dark surface. */
  scheme: 'light' | 'dark'
}

const RGB_PATTERN =
  /^rgba?\(\s*(\d*\.?\d+)[,\s]+(\d*\.?\d+)[,\s]+(\d*\.?\d+)\s*(?:[,/]\s*(\d*\.?\d+))?\s*\)$/

let context: CanvasRenderingContext2D | null | undefined

function color(value: string): RGBA {
  const rgb = RGB_PATTERN.exec(value)
  if (rgb) {
    return [
      Number(rgb[1]),
      Number(rgb[2]),
      Number(rgb[3]),
      rgb[4] === undefined ? 1 : Number(rgb[4]),
    ]
  }

  if (context === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    context = canvas.getContext('2d', { willReadFrequently: true })
  }

  if (!context) {
    return [0, 0, 0, 0]
  }

  context.clearRect(0, 0, 1, 1)
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)

  const data = context.getImageData(0, 0, 1, 1).data
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, (data[3] ?? 0) / 255]
}

function blend(front: RGBA, back: RGB): RGB {
  const channel = (index: 0 | 1 | 2) =>
    Math.round(front[index] * front[3] + back[index] * (1 - front[3]))

  return [channel(0), channel(1), channel(2)]
}

function luminance(rgb: RGB): number {
  const channels = rgb.map((value) => {
    const channel = value / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })

  return (
    (channels[0] ?? 0) * 0.2126 +
    (channels[1] ?? 0) * 0.7152 +
    (channels[2] ?? 0) * 0.0722
  )
}

function contrast(a: RGB, b: RGB): number {
  const first = luminance(a)
  const second = luminance(b)

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function css(rgb: RGB): string {
  return `rgb(${rgb.join(', ')})`
}

function cornerRadius(
  ancestors: CSSStyleDeclaration[],
  adapt: boolean
): string {
  if (!adapt) {
    return '12px'
  }

  const rounded = ancestors.find(
    (style) => parseFloat(style.borderTopLeftRadius) > 0
  )
  if (!rounded) {
    return '4px'
  }

  return `${Math.min(20, parseFloat(rounded.borderTopLeftRadius))}px`
}

/**
 * The color a link's text is drawn in. Sites such as X color an inner span and
 * leave the anchor at the browser default, which is lavender on dark pages.
 */
function linkTextColor(link: Element): string | undefined {
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT)

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim() && node.parentElement) {
      return getComputedStyle(node.parentElement).color
    }
  }

  return undefined
}

export function samplePageStyle(element: Element, adapt: boolean): PageStyle {
  const ancestors: CSSStyleDeclaration[] = []
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    ancestors.push(getComputedStyle(current))
  }

  let background: RGB = [255, 255, 255]
  for (const style of [...ancestors].reverse()) {
    background = blend(color(style.backgroundColor), background)
  }

  const dark = luminance(background) < 0.35
  if (!adapt) {
    background = dark ? [28, 29, 32] : [255, 255, 255]
  }

  const readable: RGB = dark ? [245, 245, 245] : [24, 24, 27]
  const source = getComputedStyle(element)

  let foreground = adapt ? blend(color(source.color), background) : readable
  if (contrast(foreground, background) < 4.5) {
    foreground =
      contrast([0, 0, 0], background) >= contrast([255, 255, 255], background)
        ? [0, 0, 0]
        : [255, 255, 255]
  }

  let link: Element | null = null
  for (
    let container: Element | null = element;
    container && !link;
    container = container.parentElement
  ) {
    link = container.querySelector('a[href]')
  }

  const linkColor = link && adapt ? linkTextColor(link) : undefined
  let accent = linkColor ? blend(color(linkColor), background) : foreground

  if (contrast(accent, background) < 3) {
    accent = foreground
  }

  const borderStyle = adapt
    ? ancestors.find(
        (style) =>
          parseFloat(style.borderTopWidth) > 0 &&
          style.borderTopStyle !== 'none'
      )
    : undefined

  let border = blend([...foreground, 0.18], background)
  if (borderStyle) {
    const candidate = blend(color(borderStyle.borderTopColor), background)
    if (contrast(candidate, background) >= 1.2) {
      border = candidate
    }
  }

  const shadow = adapt
    ? ancestors.find((style) => style.boxShadow !== 'none')?.boxShadow
    : undefined

  return {
    background: css(background),
    foreground: css(foreground),
    accent: css(accent),
    border: css(border),
    radius: cornerRadius(ancestors, adapt),
    shadow: shadow ?? `0 8px 30px rgba(0, 0, 0, ${dark ? 0.32 : 0.12})`,
    scheme: dark ? 'dark' : 'light',
  }
}

export function applyPageStyle(host: HTMLElement, style: PageStyle): void {
  for (const [name, value] of Object.entries(style)) {
    host.style.setProperty(`--shvyd-${name}`, value)
  }
}
