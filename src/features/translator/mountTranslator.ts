import {
  getLanguage,
  supportsLanguage,
  type Language,
} from '@/domain/languages/languages'
import {
  DEFAULT_SETTINGS,
  initialTarget,
  publicPreferences,
  type Preferences,
} from '@/domain/settings/settings'
import { TranslationError } from '@/domain/translation/translation'
import type { TranslationClient } from '@/domain/translation/translation-client'
import { createLanguagePicker } from './components/createLanguagePicker'
import { createTranslatorView } from './components/createTranslatorView'
import { copyTranslation } from './logic/copyTranslation'
import { renderTranslation } from './logic/formatted-text'
import {
  isSameSelection,
  readPageSelection,
  type PagePoint,
  type PageSelection,
} from './logic/readPageSelection'
import { applyPageStyle, samplePageStyle } from './logic/page-style'
import { predictTextBox } from './logic/predictTextBox'
import {
  resizePanel,
  type Rect,
  type ResizeHandle,
  type Size,
} from './logic/resizePanel'
import { scrollEdges } from './logic/scrollEdges'

/** Minimum distance between the popup and the viewport edge. */
const VIEWPORT_MARGIN = 12
/** Distance between the selected text and the popup. */
const SELECTION_GAP = 9
/** Distance from the cursor to the button or popup corner, clear of the pointer. */
const CURSOR_GAP = 12
/** Translations into Ukrainian, Polish, or German usually run a little longer. */
const TRANSLATION_EXPANSION = 1.15
/** Smallest window a resize allows: the toolbar and two lines of text. */
const MIN_PANEL_SIZE: Size = { width: 220, height: 100 }
const RESIZE_MS = 200
const OPEN_MS = 140

type DragOrigin = {
  pointerId: number
  pointerX: number
  pointerY: number
  left: number
  top: number
}

type ResizeOrigin = {
  pointerId: number
  pointerX: number
  pointerY: number
  handle: ResizeHandle
  element: HTMLElement
  /** The panel's box when the resize started. */
  start: Rect
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/**
 * Show the translation popup for text selections on this page, unless Shvyd is
 * turned off for `site`. Without a site (the playground), it always shows.
 */
export function mountTranslator(
  client: TranslationClient,
  { site }: { site?: string } = {}
): () => void {
  if (document.getElementById('shvyd-root')) {
    return () => undefined
  }

  let translator: Translator | undefined
  let unmounted = false

  function start(): void {
    if (!unmounted && !translator) {
      translator = startTranslator(client)
    }
  }

  function remove(): void {
    translator?.stop()
    translator = undefined
  }

  client.onTabMessage((message) => {
    if (message.kind === 'preferences-changed') {
      translator?.applyPreferences(message.preferences)
    } else if (message.site === site && message.kind === 'site-hidden') {
      remove()
    } else if (message.site === site && message.kind === 'site-shown') {
      start()
    }
  })

  if (!site) {
    start()
  } else {
    // If the status cannot be read, keep the previous behavior and show Shvyd.
    client.siteHidden(site).then((hidden) => {
      if (!hidden) {
        start()
      }
    }, start)
  }

  return () => {
    unmounted = true
    remove()
  }
}

type Translator = {
  stop: () => void
  /** Settings changed elsewhere; used from the next selection on. */
  applyPreferences: (value: Preferences) => void
}

function startTranslator(client: TranslationClient): Translator {
  const picker = createLanguagePicker({
    onSelect: (code) => {
      void chooseTarget(code)
    },
  })
  const {
    host,
    root,
    bubble,
    frame: panelFrame,
    panel,
    toolbar,
    copy,
    closeButton,
    loading,
    output,
    measure,
    status,
    actions,
    retry,
    settings,
    resizeHandles,
  } = createTranslatorView(picker)

  let preferences = publicPreferences(DEFAULT_SETTINGS)
  let selected: PageSelection | undefined
  let sessionTarget: Language | undefined
  let copiedText = ''
  let pointerDown = false
  /** The latest pointer press was inside the popup, so its selection is ours. */
  let pointerInside = false
  let lastPointer: PagePoint | undefined
  /** Final panel height while a resize animation runs. */
  let panelTargetHeight: number | undefined
  let destroyed = false

  // Each translation and language choice takes a ticket. Results that arrive
  // after a newer ticket was issued are ignored.
  let generation = 0
  let choiceGeneration = 0

  let frame = 0
  let resizeFrame = 0
  let panelPosition: { x: number; y: number } | undefined
  /** Side of the selection the open popup took; kept until it closes. */
  let panelSide: 'below' | 'above' | undefined
  let dragOrigin: DragOrigin | undefined
  /** Size chosen by resizing; the popup's content decides otherwise. */
  let panelSize: Size | undefined
  let resizeOrigin: ResizeOrigin | undefined

  picker.update({ preferences, target: initialTarget(preferences) })
  void client
    .preferences()
    .then((value) => {
      if (panel.hidden) {
        setPreferences(value)
        picker.update({ preferences, target: initialTarget(preferences) })
      }
    })
    .catch(() => undefined)

  /** Saves `value` and restyles a visible Translate button. */
  function setPreferences(value: Preferences): void {
    const compactChanged = value.compactButton !== preferences.compactButton
    preferences = value

    bubble.classList.toggle('compact', preferences.compactButton)
    bubble.title = preferences.compactButton ? 'Translate' : ''

    if (compactChanged && !bubble.hidden) {
      position(bubble)
    }
  }

  // Visibility and layout

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
    // Once the popup closes, a selection can no longer belong to it.
    pointerInside = false

    for (const animation of panelFrame.getAnimations({ subtree: true })) {
      animation.cancel()
    }

    endDrag()
    endResize()
    applySize(undefined)
    panelPosition = undefined
    panelSide = undefined
    generation++
    bubble.hidden = true
    panel.hidden = true
    picker.close()
    sessionTarget = undefined
    choiceGeneration++
    selected = undefined

    try {
      if (host.matches(':popover-open')) {
        host.hidePopover()
      }
    } catch {
      /* No popover support. */
    }
  }

  function position(element: HTMLElement): void {
    if (!selected) {
      return
    }

    const cursor =
      preferences.popupAnchor === 'cursor' ? selected.pointer() : undefined
    const anchor = cursor ?? selected.anchor()
    const gap = cursor ? CURSOR_GAP : SELECTION_GAP
    const width = element.offsetWidth
    // Mid-animation the panel is shorter than it will be; place it for its final size.
    const height =
      element === panel && panelTargetHeight !== undefined
        ? panelTargetHeight
        : element.offsetHeight

    // By the cursor the popup starts beside it; at a selection it ends with it.
    let x = cursor ? anchor.left + gap : anchor.right - width
    let y = anchor.bottom + gap
    let below = y + height <= window.innerHeight - VIEWPORT_MARGIN

    // An open popup keeps its side, so a translation taller or shorter than
    // predicted cannot flip it across the selection.
    if (element === panel) {
      below = panelSide ? panelSide === 'below' : below
      panelSide = below ? 'below' : 'above'
    }

    if (!below) {
      y = anchor.top - height - gap
    }

    if (element === panel && panelPosition) {
      x = panelPosition.x
      y = panelPosition.y
    }

    x = clamp(x, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    y = clamp(y, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
    // The panel moves inside a frame that also holds its resize handles.
    const box = element === panel ? panelFrame : element
    box.style.left = `${x}px`
    box.style.top = `${y}px`

    if (element === panel) {
      if (panelPosition) {
        panelPosition = { x, y }
      }

      picker.position()
    }
  }

  function positionVisible(): void {
    if (!panel.hidden) {
      position(panel)
    } else if (!bubble.hidden) {
      position(bubble)
    }
  }

  function showMessage(message: string): void {
    status.textContent = message
    status.className = 'status'
    status.hidden = false
  }

  /** Shows the action row with only these buttons, or hides it when empty. */
  function showActions(...visible: HTMLButtonElement[]): void {
    for (const button of [retry, settings]) {
      button.hidden = !visible.includes(button)
    }

    actions.hidden = visible.length === 0
  }

  // Selection

  function readSelection(): void {
    frame = 0

    // Selecting text inside the popup, for example to copy part of a translation.
    if (
      destroyed ||
      pointerDown ||
      pointerInside ||
      window.getSelection()?.anchorNode?.getRootNode() === root
    ) {
      return
    }

    const result = readPageSelection(lastPointer)

    if (result.kind === 'none') {
      if (panel.hidden) {
        dismiss()
      }

      return
    }

    if (result.kind !== 'selected') {
      dismiss()
      return
    }

    const next = result.selection

    if (selected && !panel.hidden && isSameSelection(selected, next)) {
      return
    }

    dismiss()
    selected = next
    applyPageStyle(host, samplePageStyle(next.element, preferences.adaptToPage))
    bubble.hidden = false
    reveal()
    position(bubble)
  }

  function scheduleSelection(): void {
    if (!frame) {
      frame = requestAnimationFrame(readSelection)
    }
  }

  // Translation

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  /**
   * Draws placeholder lines in a box as tall as the translation will likely be:
   * the selected text laid out in a hidden copy of the text box, a little longer.
   */
  function renderSkeleton(): void {
    renderTranslation(
      measure,
      selected?.content ?? { text: '', format: 'plain' }
    )

    const style = getComputedStyle(measure)
    const maxHeight = parseFloat(style.maxHeight)
    const textWidth =
      measure.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    const range = document.createRange()
    range.selectNodeContents(measure)
    const lastLine = [...range.getClientRects()].at(-1)
    const prediction = predictTextBox({
      sourceHeight: measure.scrollHeight,
      padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      lineHeight: parseFloat(style.lineHeight),
      maxHeight: Number.isNaN(maxHeight) ? Infinity : maxHeight,
      expansion: TRANSLATION_EXPANSION,
      lastLineRatio: lastLine && textWidth > 0 ? lastLine.width / textWidth : 1,
    })

    measure.replaceChildren()

    const lines = Array.from({ length: prediction.lines }, () =>
      document.createElement('div')
    )

    for (const line of lines) {
      line.className = 'line'
    }

    lines
      .at(-1)
      ?.style.setProperty(
        'width',
        `${Math.round(prediction.lastLineWidth * 100)}%`
      )
    loading.replaceChildren(...lines)

    // A resized panel already has its height; the placeholder fills it instead.
    if (panelSize) {
      loading.style.removeProperty('height')
    } else {
      loading.style.height = `${prediction.height}px`
    }
  }

  /** Fades the edges of the translation that hide text and outlines the toolbar. */
  function markScrollEdges(): void {
    const edges = output.hidden
      ? { above: false, below: false }
      : scrollEdges(output)

    panel.toggleAttribute('data-above', edges.above)
    panel.toggleAttribute('data-below', edges.below)
  }

  /**
   * Applies `update`, then eases the panel from its old height and place to
   * the new ones. Above the selection a height change also moves the top edge.
   */
  function resizeSmoothly(update: () => void): void {
    const before = panel.getBoundingClientRect()
    update()
    position(panel)
    const after = panel.getBoundingClientRect()
    const options = {
      duration: RESIZE_MS,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    }

    if (reducedMotion.matches || panel.hidden) {
      return
    }

    if (Math.abs(after.top - before.top) >= 1) {
      panelFrame.animate(
        [
          { transform: `translateY(${before.top - after.top}px)` },
          { transform: 'none' },
        ],
        options
      )
    }

    if (Math.abs(after.height - before.height) < 2) {
      return
    }

    panel.style.overflow = 'hidden'
    panelTargetHeight = after.height
    const animation = panel.animate(
      [{ height: `${before.height}px` }, { height: `${after.height}px` }],
      options
    )
    const restore = () => {
      panelTargetHeight = undefined
      panel.style.removeProperty('overflow')
    }
    animation.onfinish = restore
    animation.oncancel = restore
  }

  function showLoading(): void {
    const opening = panel.hidden
    bubble.hidden = true
    panel.hidden = false

    if (opening && !reducedMotion.matches) {
      panel.animate(
        [
          { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: OPEN_MS, easing: 'ease-out' }
      )
    }

    output.hidden = true
    output.textContent = ''
    markScrollEdges()
    copiedText = ''
    copy.disabled = true
    copy.setAttribute('aria-label', 'Copy translation')
    copy.title = 'Copy translation'
    renderSkeleton()
    loading.hidden = false
    status.hidden = false
    status.className = 'status sr-only'
    status.textContent = 'Translating…'
    showActions()
  }

  async function translate(): Promise<void> {
    if (!selected) {
      return
    }

    const content = selected.content
    const ticket = ++generation
    const isStale = () => ticket !== generation || destroyed

    showLoading()
    picker.update({
      preferences,
      target: sessionTarget ?? initialTarget(preferences),
    })
    panel.setAttribute('aria-busy', 'true')
    reveal()
    position(panel)

    try {
      setPreferences(await client.preferences())
      if (isStale()) {
        return
      }

      const translationTarget =
        sessionTarget && supportsLanguage(sessionTarget, preferences.provider)
          ? sessionTarget
          : initialTarget(preferences)
      sessionTarget = translationTarget
      picker.update({ preferences, target: translationTarget })

      if (selected) {
        applyPageStyle(
          host,
          samplePageStyle(selected.element, preferences.adaptToPage)
        )
      }

      const translation = await client.translate({
        ...content,
        target: translationTarget,
        provider: preferences.provider,
      })
      if (isStale()) {
        return
      }

      resizeSmoothly(() => {
        copiedText = renderTranslation(output, translation)
        output.lang = translation.target
        output.dir = getLanguage(translation.target)?.direction ?? 'auto'
        output.hidden = false
        output.scrollTop = 0
        loading.hidden = true
        status.hidden = true
      })
      markScrollEdges()
      copy.disabled = false
    } catch (error) {
      if (isStale()) {
        return
      }

      resizeSmoothly(() => {
        loading.hidden = true
        showMessage(
          error instanceof Error
            ? error.message
            : 'Translation could not finish. Try again.'
        )
      })
      const needsSettings =
        error instanceof TranslationError &&
        (error.code === 'configuration' || error.code === 'authentication')

      if (needsSettings) {
        showActions(settings)
      } else {
        showActions(retry, settings)
      }
    } finally {
      if (!isStale()) {
        panel.setAttribute('aria-busy', 'false')
        position(panel)
      }
    }
  }

  async function chooseTarget(code: Language): Promise<void> {
    const choice = ++choiceGeneration

    generation++
    sessionTarget = code
    showLoading()
    picker.update({ preferences, target: code })
    panel.setAttribute('aria-busy', 'true')
    position(panel)

    try {
      if (preferences.targetMode === 'last') {
        setPreferences(await client.updatePreferences({ target: code }))
      }

      if (choice !== choiceGeneration || !selected) {
        return
      }

      await translate()
    } catch {
      if (choice !== choiceGeneration || !selected || destroyed) {
        return
      }

      loading.hidden = true
      panel.setAttribute('aria-busy', 'false')
      showMessage('The target language could not be saved. Reload this page.')
      position(panel)
    }
  }

  // Dragging

  function startDrag(event: PointerEvent): void {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      panel.hidden ||
      (event.target instanceof Element && event.target.closest('button, input'))
    ) {
      return
    }

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
  }

  function moveDrag(event: PointerEvent): void {
    if (!dragOrigin || event.pointerId !== dragOrigin.pointerId) {
      return
    }

    panelPosition = {
      x: dragOrigin.left + event.clientX - dragOrigin.pointerX,
      y: dragOrigin.top + event.clientY - dragOrigin.pointerY,
    }
    position(panel)
  }

  function endDrag(): void {
    if (!dragOrigin) {
      return
    }

    const { pointerId } = dragOrigin
    dragOrigin = undefined
    toolbar.classList.remove('dragging')
    if (toolbar.hasPointerCapture(pointerId)) {
      toolbar.releasePointerCapture(pointerId)
    }
  }

  // Resizing

  function applySize(size: Size | undefined): void {
    panelSize = size
    panel.toggleAttribute('data-sized', size !== undefined)

    if (size) {
      panel.style.width = `${size.width}px`
      panel.style.height = `${size.height}px`
    } else {
      panel.style.removeProperty('width')
      panel.style.removeProperty('height')
    }
  }

  function startResize(
    event: PointerEvent,
    handle: ResizeHandle,
    element: HTMLElement
  ): void {
    if (event.button !== 0 || !event.isPrimary || panel.hidden) {
      return
    }

    event.preventDefault()

    // A running height animation would fight the size the pointer sets.
    for (const animation of panelFrame.getAnimations({ subtree: true })) {
      animation.cancel()
    }

    const bounds = panel.getBoundingClientRect()
    panelPosition = { x: bounds.left, y: bounds.top }
    resizeOrigin = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      handle,
      element,
      start: {
        x: bounds.left,
        y: bounds.top,
        width: panelSize?.width ?? bounds.width,
        height: panelSize?.height ?? bounds.height,
      },
    }

    element.setPointerCapture(event.pointerId)
  }

  function moveResize(event: PointerEvent): void {
    if (!resizeOrigin || event.pointerId !== resizeOrigin.pointerId) {
      return
    }

    const box = resizePanel({
      start: resizeOrigin.start,
      handle: resizeOrigin.handle,
      delta: {
        x: event.clientX - resizeOrigin.pointerX,
        y: event.clientY - resizeOrigin.pointerY,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      minimum: MIN_PANEL_SIZE,
      margin: VIEWPORT_MARGIN,
    })

    panelPosition = { x: box.x, y: box.y }
    applySize({ width: box.width, height: box.height })
    position(panel)
    markScrollEdges()
  }

  function endResize(): void {
    if (!resizeOrigin) {
      return
    }

    const { pointerId, element } = resizeOrigin
    resizeOrigin = undefined
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId)
    }
  }

  function resetSize(): void {
    endResize()
    applySize(undefined)
    position(panel)
    markScrollEdges()
  }

  // Popup controls

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

  copy.addEventListener('click', async () => {
    const result = await copyTranslation({
      text: copiedText,
      clipboard: navigator.clipboard,
    })

    if (result === 'copied') {
      copy.setAttribute('aria-label', 'Translation copied')
      copy.title = 'Copied'
    } else {
      showMessage('Select the translation to copy it.')
      position(panel)
    }
  })

  // Page events, removed together when the translator is destroyed

  const events = new AbortController()
  const listen = { signal: events.signal }

  toolbar.addEventListener('pointerdown', startDrag, listen)
  toolbar.addEventListener('pointermove', moveDrag, listen)
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    toolbar.addEventListener(name, endDrag, listen)
  }

  for (const { handle, element } of resizeHandles) {
    element.addEventListener(
      'pointerdown',
      (event) => startResize(event, handle, element),
      listen
    )
    element.addEventListener('pointermove', moveResize, listen)
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(name, endResize, listen)
    }

    element.addEventListener('dblclick', resetSize, listen)
  }

  window.addEventListener('blur', endDrag, listen)
  window.addEventListener('blur', endResize, listen)
  output.addEventListener('scroll', markScrollEdges, {
    passive: true,
    signal: events.signal,
  })

  document.addEventListener(
    'pointerdown',
    (event) => {
      pointerInside = isInside(event)

      if (pointerInside) {
        const path = event.composedPath()
        if (
          !dragOrigin &&
          !resizeOrigin &&
          !path.includes(picker.menu) &&
          !path.includes(picker.button)
        ) {
          picker.close()
        }

        return
      }

      pointerDown = true
      dismiss()
    },
    listen
  )

  document.addEventListener(
    'pointerup',
    (event) => {
      pointerDown = false

      if (!isInside(event)) {
        lastPointer = { x: event.clientX, y: event.clientY }
      }

      scheduleSelection()
    },
    listen
  )

  document.addEventListener(
    'selectionchange',
    () => {
      if (!pointerDown) {
        scheduleSelection()
      }
    },
    listen
  )

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') {
        // A keyboard selection no longer ends where the pointer was released.
        if (!isInside(event)) {
          lastPointer = undefined
        }

        return
      }

      if (!picker.menu.hidden) {
        event.preventDefault()
        picker.close()
        picker.button.focus()
      } else {
        dismiss()
      }
    },
    listen
  )

  document.addEventListener(
    'scroll',
    (event) => {
      if (!isInside(event)) {
        // Reflow can scroll the page during the same frame as a window resize.
        if (resizeFrame) {
          positionVisible()
        } else {
          dismiss()
        }
      } else if (event.composedPath().includes(panel)) {
        picker.position()
      }
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
      markScrollEdges()
    },
    listen
  )

  function stop(): void {
    destroyed = true
    dismiss()
    cancelAnimationFrame(frame)
    cancelAnimationFrame(resizeFrame)
    events.abort()
    host.remove()
  }

  return {
    stop,
    applyPreferences: (value) => {
      setPreferences(value)

      if (panel.hidden) {
        picker.update({ preferences, target: initialTarget(preferences) })
      }
    },
  }
}
