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
import { createTranslatorView } from './components/createTranslatorView'
import { copyTranslation } from './logic/copyTranslation'
import { captureSelection, renderTranslation } from './logic/formatted-text'
import { applyPageStyle, samplePageStyle } from './logic/page-style'

/** Minimum distance between the popup and the viewport edge. */
const VIEWPORT_MARGIN = 12
/** Distance between the selected text and the popup. */
const SELECTION_GAP = 9

type Selected = {
  text: string
  content: ReturnType<typeof captureSelection>
  range: Range
  element: Element
}

type DragOrigin = {
  pointerId: number
  pointerX: number
  pointerY: number
  left: number
  top: number
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

  let stop: (() => void) | undefined
  let unmounted = false

  function start(): void {
    if (!unmounted && !stop) {
      stop = startTranslator(client, site)
    }
  }

  function remove(): void {
    stop?.()
    stop = undefined
  }

  if (!site) {
    start()
  } else {
    client.onSiteHidden((hidden) => {
      if (hidden === site) {
        unmounted = true
        remove()
      }
    })
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

function startTranslator(
  client: TranslationClient,
  site: string | undefined
): () => void {
  const picker = createLanguagePicker({
    onSelect: (code) => {
      void chooseTarget(code)
    },
  })
  const {
    host,
    root,
    bubble,
    panel,
    toolbar,
    copy,
    closeButton,
    loading,
    output,
    status,
    actions,
    retry,
    settings,
    hideSite,
    confirmHide,
    cancelHide,
  } = createTranslatorView(picker)

  hideSite.hidden = !site
  hideSite.title = site ? `Don't show Shvyd on ${site}` : ''

  let preferences = publicPreferences(DEFAULT_SETTINGS)
  let selected: Selected | undefined
  let sessionTarget: Language | undefined
  let copiedText = ''
  let pointerDown = false
  let destroyed = false

  // Each translation and language choice takes a ticket. Results that arrive
  // after a newer ticket was issued are ignored.
  let generation = 0
  let choiceGeneration = 0

  let frame = 0
  let resizeFrame = 0
  let panelPosition: { x: number; y: number } | undefined
  let dragOrigin: DragOrigin | undefined

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
    endDrag()
    panelPosition = undefined
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

    const rects = selected.range.getClientRects()
    const anchor =
      rects[rects.length - 1] ?? selected.range.getBoundingClientRect()
    const width = element.offsetWidth
    const height = element.offsetHeight

    let x = anchor.right - width
    let y = anchor.bottom + SELECTION_GAP
    if (y + height > window.innerHeight - VIEWPORT_MARGIN) {
      y = anchor.top - height - SELECTION_GAP
    }

    if (element === panel && panelPosition) {
      x = panelPosition.x
      y = panelPosition.y
    }

    x = clamp(x, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    y = clamp(y, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
    element.style.left = `${x}px`
    element.style.top = `${y}px`

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
    for (const button of [retry, settings, confirmHide, cancelHide]) {
      button.hidden = !visible.includes(button)
    }

    actions.hidden = visible.length === 0
  }

  // Selection

  function readSelection(): void {
    frame = 0
    if (destroyed || pointerDown) {
      return
    }

    const selection = window.getSelection()
    if (
      !selection ||
      !selection.rangeCount ||
      selection.anchorNode?.getRootNode() === root
    ) {
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      if (panel.hidden) {
        dismiss()
      }

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
    ) {
      return
    }

    const isSameSelection =
      selected?.text === text &&
      !panel.hidden &&
      selected.range.compareBoundaryPoints(Range.START_TO_START, range) === 0 &&
      selected.range.compareBoundaryPoints(Range.END_TO_END, range) === 0
    if (isSameSelection) {
      return
    }

    dismiss()
    selected = { text, content: captureSelection(range, text), range, element }
    applyPageStyle(host, samplePageStyle(element, preferences.adaptToPage))
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

  function showLoading(): void {
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
      preferences = await client.preferences()
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

      copiedText = renderTranslation(output, translation)
      output.lang = translation.target
      output.dir = getLanguage(translation.target)?.direction ?? 'auto'
      output.hidden = false
      loading.hidden = true
      status.hidden = true
      copy.disabled = false
    } catch (error) {
      if (isStale()) {
        return
      }

      loading.hidden = true
      showMessage(
        error instanceof Error
          ? error.message
          : 'Translation could not finish. Try again.'
      )
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
        preferences = await client.updatePreferences({ target: code })
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

  hideSite.addEventListener('click', () => {
    if (!site) {
      return
    }

    // Ask first: one stray click should not turn Shvyd off for a whole site.
    generation++
    picker.close()
    loading.hidden = true
    output.hidden = true
    copy.disabled = true
    panel.setAttribute('aria-busy', 'false')
    showMessage(
      `Stop showing Shvyd on ${site}? You can turn it back on in settings.`
    )
    showActions(confirmHide, cancelHide)
    position(panel)
    confirmHide.focus()
  })

  cancelHide.addEventListener('click', () => {
    void translate()
  })

  confirmHide.addEventListener('click', async () => {
    if (!site) {
      return
    }

    confirmHide.disabled = true

    try {
      // The background then tells every frame on this site, including this one.
      await client.hideSite(site)
    } catch {
      showMessage('Shvyd could not turn itself off here. Try again.')
      position(panel)
    } finally {
      confirmHide.disabled = false
    }
  })

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

  window.addEventListener('blur', endDrag, listen)

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (isInside(event)) {
        const path = event.composedPath()
        if (
          !dragOrigin &&
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
    () => {
      pointerDown = false
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
    },
    listen
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
