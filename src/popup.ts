import type { TranslationClient } from './client'
import {
  DEFAULT_SETTINGS,
  initialTarget,
  publicPreferences,
  type Language,
} from './settings'
import { getLanguage, supportsLanguage } from './languages'
import { createLanguagePicker } from './language-picker'
import { applyPageStyle, samplePageStyle } from './page-style'
import { MAX_SELECTION_LENGTH, TranslationError } from './translation'
import { copyTranslation } from './clipboard'
import { captureSelection, renderTranslation } from './formatted-text'

const CSS = `
:host { all: initial; }
:host::backdrop { background: transparent; pointer-events: none; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--shvyd-accent); outline-offset: 3px; }
.bubble, .panel { position: fixed; color: var(--shvyd-foreground); background: var(--shvyd-background); border: 1px solid var(--shvyd-border); box-shadow: var(--shvyd-shadow); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif; letter-spacing: normal; }
.bubble { display: flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: max(4px, var(--shvyd-radius)); font-size: 13px; line-height: 18px; white-space: nowrap; }
.bubble svg { color: var(--shvyd-accent); }
.panel { width: min(410px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); border-radius: var(--shvyd-radius); overflow: auto; overscroll-behavior: contain; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0 15px; }
.target { min-width: 0; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; background: transparent; font-size: 12px; padding: 4px 2px; color: var(--shvyd-accent); cursor: pointer; }
.language-menu { margin: 10px 12px 0; padding: 8px; border: 1px solid var(--shvyd-border); border-radius: max(4px, var(--shvyd-radius)); }
.language-list { max-height: 170px; overflow: auto; overscroll-behavior: contain; font-size: 12px; }
.language-option { display: block; width: 100%; border: 0; background: transparent; padding: 8px; text-align: start; border-radius: 4px; font-size: 12px; }
.language-option:hover, .language-option[aria-selected=true] { background: color-mix(in srgb, var(--shvyd-foreground) 8%, transparent); }
.more-languages { border: 0; border-top: 1px solid var(--shvyd-border); width: 100%; text-align: start; padding: 10px 8px 2px; background: transparent; color: var(--shvyd-accent); font-size: 12px; }
.language-search { width: 100%; border: 1px solid var(--shvyd-border); background: var(--shvyd-background); padding: 8px; border-radius: 4px; font-size: 12px; margin: 8px 0; }
.language-search:focus-visible { outline: 2px solid var(--shvyd-accent); outline-offset: 1px; }
.spacer { flex: 1; }
.icon { width: 28px; height: 28px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 4px; padding: 4px; opacity: .65; }
.icon:hover { opacity: 1; background: color-mix(in srgb, var(--shvyd-foreground) 7%, transparent); }
.icon:disabled { opacity: .25; cursor: default; }
svg { display: block; width: 16px; height: 16px; flex-shrink: 0; }
.translation { padding: 13px 17px 18px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; text-align: start; user-select: text; max-height: min(55dvh, 480px); overflow: auto; }
.translation.formatted { white-space: normal; }
.formatted p, .formatted h1, .formatted h2, .formatted h3, .formatted h4, .formatted h5, .formatted h6, .formatted pre, .formatted table, .formatted dl { margin: 0 0 .8em; }
.formatted h1, .formatted h2, .formatted h3, .formatted h4, .formatted h5, .formatted h6 { font-size: 1em; font-weight: 650; line-height: 1.5; }
.formatted strong, .formatted th, .formatted dt { font-weight: 650; }
.formatted ul, .formatted ol { padding-inline-start: 1.5em; margin: 0 0 .8em; }
.formatted li + li { margin-block-start: .35em; }
.formatted li > ul, .formatted li > ol { margin-block: .35em 0; }
.formatted div + div { margin-block-start: .8em; }
.formatted blockquote { margin: 0 0 .8em; padding-inline-start: 12px; border-inline-start: 2px solid var(--shvyd-border); }
.formatted pre, .formatted code { font: inherit; white-space: pre-wrap; }
.formatted pre { padding: 8px 10px; border: 1px solid var(--shvyd-border); border-radius: 4px; }
.formatted table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.formatted td, .formatted th { border: 1px solid var(--shvyd-border); padding: 6px 8px; text-align: start; vertical-align: top; }
.formatted dd { margin-inline-start: 1em; }
.formatted :last-child { margin-block-end: 0; }
.status { padding: 0 17px 16px; font-size: 13px; line-height: 1.5; }
.actions { padding: 0 17px 16px; display: flex; gap: 14px; }
.text-button { border: 0; padding: 0; background: transparent; text-decoration: underline; text-underline-offset: 3px; color: var(--shvyd-accent); font-size: 13px; }
.loading { padding: 18px 17px; }
.line { height: 10px; margin: 7px 0 12px; border-radius: 3px; background: color-mix(in srgb, var(--shvyd-foreground) 10%, transparent); }
.line:last-child { width: 64%; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
`

function icon(path: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const shape = document.createElementNS(svg.namespaceURI, 'path')
  shape.setAttribute('d', path)
  svg.append(shape)
  return svg
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  if (text) element.textContent = text
  return element
}

export function mountTranslator(client: TranslationClient): () => void {
  if (document.getElementById('shvyd-root')) return () => undefined
  const host = make('div', '')
  host.id = 'shvyd-root'
  for (const [name, value] of Object.entries({
    position: 'fixed',
    inset: '0',
    width: '0',
    height: '0',
    padding: '0',
    margin: '0',
    border: '0',
    overflow: 'visible',
    background: 'transparent',
    'z-index': '2147483647',
  })) {
    host.style.setProperty(name, value, 'important')
  }
  host.setAttribute('popover', 'manual')
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = CSS
  const bubble = make('button', 'bubble')
  bubble.type = 'button'
  bubble.setAttribute('aria-label', 'Translate selected text')
  bubble.append(
    icon(
      'M4 5h11M10 3v2M6 5c0 6 5 9 9 11M14 5c0 6-5 9-10 11M14 21l4-10 4 10M15.5 17h5'
    ),
    document.createTextNode('Translate')
  )
  const panel = make('section', 'panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Selected text translation')
  const toolbar = make('div', 'toolbar')
  const picker = createLanguagePicker({
    onSelect: (code) => {
      void chooseTarget(code)
    },
    onResize: () => {
      if (!panel.hidden) position(panel)
    },
  })
  const copy = make('button', 'icon')
  copy.type = 'button'
  copy.setAttribute('aria-label', 'Copy translation')
  copy.title = 'Copy translation'
  copy.append(icon('M8 8h12v13H8zM16 8V3H3v13h5'))
  const closeButton = make('button', 'icon')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', 'Close translation')
  closeButton.title = 'Close'
  closeButton.append(icon('M6 6l12 12M18 6 6 18'))
  toolbar.append(picker.button, make('span', 'spacer'), copy, closeButton)
  const output = make('div', 'translation')
  output.setAttribute('aria-live', 'polite')
  const loading = make('div', 'loading')
  loading.setAttribute('aria-hidden', 'true')
  loading.append(make('div', 'line'), make('div', 'line'), make('div', 'line'))
  const status = make('div', 'status')
  status.setAttribute('role', 'status')
  const actions = make('div', 'actions')
  const retry = make('button', 'text-button', 'Try again')
  const settings = make('button', 'text-button', 'Settings')
  retry.type = settings.type = 'button'
  actions.append(retry, settings)
  panel.append(toolbar, picker.menu, loading, output, status, actions)
  bubble.hidden = panel.hidden = true
  root.append(style, bubble, panel)
  document.documentElement.append(host)

  let preferences = publicPreferences(DEFAULT_SETTINGS)
  let sessionTarget: Language | undefined
  let choiceGeneration = 0
  let selected:
    | {
        text: string
        content: ReturnType<typeof captureSelection>
        range: Range
        element: Element
      }
    | undefined
  let copiedText = ''
  let pointerDown = false
  let generation = 0
  let frame = 0
  let destroyed = false
  picker.update({ preferences, target: initialTarget(preferences) })
  void client
    .preferences()
    .then((value) => {
      if (panel.hidden) {
        preferences = value
        picker.update({ preferences, target: initialTarget(preferences) })
      }
    })
    .catch(() => undefined)

  function isInside(event: Event): boolean {
    return event.composedPath().includes(host)
  }
  function reveal(): void {
    if (!host.matches(':popover-open')) {
      try {
        host.showPopover()
      } catch {
        /* Fixed-position fallback for older Chromium builds. */
      }
    }
  }
  function dismiss(): void {
    generation++
    bubble.hidden = panel.hidden = true
    picker.close()
    sessionTarget = undefined
    choiceGeneration++
    selected = undefined
    try {
      if (host.matches(':popover-open')) host.hidePopover()
    } catch {
      /* No popover support. */
    }
  }

  function position(element: HTMLElement): void {
    if (!selected) return
    const rects = selected.range.getClientRects()
    const anchor =
      rects[rects.length - 1] ?? selected.range.getBoundingClientRect()
    const width = element.offsetWidth,
      height = element.offsetHeight
    const x = Math.max(
      12,
      Math.min(anchor.right - width, window.innerWidth - width - 12)
    )
    let y = anchor.bottom + 9
    if (y + height > window.innerHeight - 12) y = anchor.top - height - 9
    element.style.left = `${x}px`
    element.style.top = `${Math.max(12, Math.min(y, window.innerHeight - height - 12))}px`
  }

  function readSelection(): void {
    frame = 0
    if (destroyed || pointerDown) return
    const selection = window.getSelection()
    if (
      !selection ||
      !selection.rangeCount ||
      selection.anchorNode?.getRootNode() === root
    )
      return
    const text = selection.toString().trim()
    if (!text) {
      if (panel.hidden) dismiss()
      return
    }
    if (text.length > MAX_SELECTION_LENGTH) {
      dismiss()
      return
    }
    const range = selection.getRangeAt(0).cloneRange()
    const ancestor = range.commonAncestorContainer
    const element =
      ancestor instanceof Element ? ancestor : ancestor.parentElement
    if (
      !element ||
      element.closest('input, textarea') ||
      element.getRootNode() === root
    )
      return
    if (
      selected?.text === text &&
      !panel.hidden &&
      selected.range.compareBoundaryPoints(Range.START_TO_START, range) === 0 &&
      selected.range.compareBoundaryPoints(Range.END_TO_END, range) === 0
    )
      return
    dismiss()
    selected = { text, content: captureSelection(range, text), range, element }
    applyPageStyle(host, samplePageStyle(element, preferences.adaptToPage))
    bubble.hidden = false
    reveal()
    position(bubble)
  }

  function scheduleSelection(): void {
    if (!frame) frame = requestAnimationFrame(readSelection)
  }

  async function translate(): Promise<void> {
    if (!selected) return
    const content = selected.content
    const ticket = ++generation
    bubble.hidden = true
    panel.hidden = false
    output.hidden = true
    output.textContent = ''
    copiedText = ''
    copy.disabled = true
    copy.setAttribute('aria-label', 'Copy translation')
    copy.title = 'Copy translation'
    loading.hidden = false
    status.hidden = false
    status.className = 'status sr-only'
    status.textContent = 'Translating…'
    actions.hidden = true
    picker.update({
      preferences,
      target: sessionTarget ?? initialTarget(preferences),
    })
    panel.setAttribute('aria-busy', 'true')
    reveal()
    position(panel)
    try {
      preferences = await client.preferences()
      if (ticket !== generation || destroyed) return
      const translationTarget =
        sessionTarget && supportsLanguage(sessionTarget, preferences.provider)
          ? sessionTarget
          : initialTarget(preferences)
      sessionTarget = translationTarget
      picker.update({ preferences, target: translationTarget })
      if (selected)
        applyPageStyle(
          host,
          samplePageStyle(selected.element, preferences.adaptToPage)
        )
      const translation = await client.translate({
        ...content,
        target: translationTarget,
        provider: preferences.provider,
      })
      if (ticket !== generation || destroyed) return
      copiedText = renderTranslation(output, translation)
      output.lang = translation.target
      output.dir = getLanguage(translation.target)?.direction ?? 'auto'
      output.hidden = false
      loading.hidden = status.hidden = true
      copy.disabled = false
    } catch (error) {
      if (ticket !== generation || destroyed) return
      loading.hidden = true
      status.hidden = false
      status.className = 'status'
      status.textContent =
        error instanceof Error
          ? error.message
          : 'Translation could not finish. Try again.'
      actions.hidden = false
      retry.hidden =
        error instanceof TranslationError &&
        (error.code === 'configuration' || error.code === 'authentication')
    } finally {
      if (ticket === generation && !destroyed) {
        panel.setAttribute('aria-busy', 'false')
        position(panel)
      }
    }
  }

  bubble.addEventListener('pointerdown', (event) => event.preventDefault())
  bubble.addEventListener('click', () => {
    void translate()
  })
  retry.addEventListener('click', () => {
    void translate()
  })
  settings.addEventListener('click', () => {
    void client.openSettings().catch(() => undefined)
  })
  closeButton.addEventListener('click', dismiss)
  async function chooseTarget(code: Language): Promise<void> {
    const choice = ++choiceGeneration
    try {
      if (preferences.targetMode === 'last')
        preferences = await client.updatePreferences({ target: code })
      if (choice !== choiceGeneration || !selected) return
      sessionTarget = code
      await translate()
    } catch {
      status.textContent =
        'The target language could not be saved. Reload this page.'
      status.className = 'status'
      status.hidden = false
    }
  }
  copy.addEventListener('click', async () => {
    const result = await copyTranslation({
      text: copiedText,
      clipboard: navigator.clipboard,
    })
    if (result === 'copied') {
      copy.setAttribute('aria-label', 'Translation copied')
      copy.title = 'Copied'
    } else {
      status.textContent = 'Select the translation to copy it.'
      status.className = 'status'
      status.hidden = false
      position(panel)
    }
  })

  const events = new AbortController()
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (isInside(event)) return
      pointerDown = true
      dismiss()
    },
    { signal: events.signal }
  )
  document.addEventListener(
    'pointerup',
    () => {
      pointerDown = false
      scheduleSelection()
    },
    { signal: events.signal }
  )
  document.addEventListener(
    'selectionchange',
    () => {
      if (!pointerDown) scheduleSelection()
    },
    { signal: events.signal }
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') dismiss()
    },
    { signal: events.signal }
  )
  document.addEventListener(
    'scroll',
    (event) => {
      if (!isInside(event)) dismiss()
    },
    { capture: true, passive: true, signal: events.signal }
  )
  window.addEventListener(
    'resize',
    () => {
      if (!panel.hidden) position(panel)
      else if (!bubble.hidden) position(bubble)
    },
    { signal: events.signal }
  )
  return () => {
    destroyed = true
    dismiss()
    cancelAnimationFrame(frame)
    events.abort()
    host.remove()
  }
}
