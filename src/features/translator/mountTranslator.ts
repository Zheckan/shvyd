import {
  getLanguage,
  supportsLanguage,
  type Language,
} from '@/domain/languages/languages'
import {
  DEFAULT_SETTINGS,
  initialTarget,
  publicPreferences,
} from '@/domain/settings/settings'
import {
  MAX_SELECTION_LENGTH,
  TranslationError,
} from '@/domain/translation/translation'
import type { TranslationClient } from '@/domain/translation/translation-client'
import { createLanguagePicker } from './components/createLanguagePicker'
import { icon, make } from './components/elements'
import { copyTranslation } from './logic/copyTranslation'
import { captureSelection, renderTranslation } from './logic/formatted-text'
import { applyPageStyle, samplePageStyle } from './logic/page-style'
import { TRANSLATOR_STYLES } from './translatorStyles'

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
  style.textContent = TRANSLATOR_STYLES
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
  const dragHandle = make('span', 'spacer')
  dragHandle.title = 'Drag to move translation'
  toolbar.append(picker.button, dragHandle, copy, closeButton)
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
  panel.append(toolbar, loading, output, status, actions)
  bubble.hidden = panel.hidden = true
  root.append(style, bubble, panel, picker.menu)
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
  let resizeFrame = 0
  let destroyed = false
  let panelPosition: { x: number; y: number } | undefined
  let dragOrigin:
    | {
        pointerId: number
        pointerX: number
        pointerY: number
        left: number
        top: number
      }
    | undefined
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
    endDrag()
    panelPosition = undefined
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
    let x = anchor.right - width
    let y = anchor.bottom + 9
    if (y + height > window.innerHeight - 12) y = anchor.top - height - 9
    if (element === panel && panelPosition) {
      x = panelPosition.x
      y = panelPosition.y
    }
    x = Math.max(12, Math.min(x, window.innerWidth - width - 12))
    y = Math.max(12, Math.min(y, window.innerHeight - height - 12))
    element.style.left = `${x}px`
    element.style.top = `${y}px`
    if (element === panel) {
      if (panelPosition) panelPosition = { x, y }
      picker.position()
    }
  }

  function endDrag(): void {
    if (!dragOrigin) return
    const { pointerId } = dragOrigin
    dragOrigin = undefined
    toolbar.classList.remove('dragging')
    if (toolbar.hasPointerCapture(pointerId))
      toolbar.releasePointerCapture(pointerId)
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

  function positionVisible(): void {
    if (!panel.hidden) position(panel)
    else if (!bubble.hidden) position(bubble)
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
  toolbar.addEventListener(
    'pointerdown',
    (event) => {
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        panel.hidden ||
        (event.target instanceof Element &&
          event.target.closest('button, input'))
      )
        return
      event.preventDefault()
      const bounds = panel.getBoundingClientRect()
      panelPosition = { x: bounds.left, y: bounds.top }
      dragOrigin = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: bounds.left,
        top: bounds.top,
      }
      toolbar.classList.add('dragging')
      toolbar.setPointerCapture(event.pointerId)
    },
    { signal: events.signal }
  )
  toolbar.addEventListener(
    'pointermove',
    (event) => {
      if (!dragOrigin || event.pointerId !== dragOrigin.pointerId) return
      panelPosition = {
        x: dragOrigin.left + event.clientX - dragOrigin.pointerX,
        y: dragOrigin.top + event.clientY - dragOrigin.pointerY,
      }
      position(panel)
    },
    { signal: events.signal }
  )
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    toolbar.addEventListener(name, endDrag, { signal: events.signal })
  }
  window.addEventListener('blur', endDrag, { signal: events.signal })
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (isInside(event)) {
        const path = event.composedPath()
        if (
          !dragOrigin &&
          !path.includes(picker.menu) &&
          !path.includes(picker.button)
        )
          picker.close()
        return
      }
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
      if (event.key === 'Escape') {
        if (!picker.menu.hidden) {
          event.preventDefault()
          picker.close()
          picker.button.focus()
        } else dismiss()
      }
    },
    { signal: events.signal }
  )
  document.addEventListener(
    'scroll',
    (event) => {
      if (!isInside(event)) {
        // Reflow can scroll the page during the same frame as a window resize.
        if (resizeFrame) positionVisible()
        else dismiss()
      } else if (event.composedPath().includes(panel)) picker.position()
    },
    { capture: true, passive: true, signal: events.signal }
  )
  window.addEventListener(
    'resize',
    () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0
      })
      positionVisible()
    },
    { signal: events.signal }
  )
  return () => {
    destroyed = true
    dismiss()
    cancelAnimationFrame(frame)
    cancelAnimationFrame(resizeFrame)
    events.abort()
    host.remove()
  }
}
