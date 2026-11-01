import { RESIZE_HANDLES } from '../logic/resizePanel'
import { TRANSLATOR_STYLES } from '../translatorStyles'
import type { createLanguagePicker } from './createLanguagePicker'
import { icon, make } from './elements'

/** Heroicons "language", outline 24 px. MIT license; see THIRD_PARTY_NOTICES. */
const TRANSLATE_ICON =
  'm10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802'
const COPY_ICON = 'M8 8h12v13H8zM16 8V3H3v13h5'
const CLOSE_ICON = 'M6 6l12 12M18 6 6 18'

// Keep page styles from resizing or hiding the zero-size host element.
const HOST_STYLES = {
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
}

export type TranslatorView = ReturnType<typeof createTranslatorView>

function iconButton(
  label: string,
  title: string,
  path: string
): HTMLButtonElement {
  const button = make('button', 'icon')
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.title = title
  button.append(icon(path))

  return button
}

function textButton(text: string): HTMLButtonElement {
  const button = make('button', 'text-button', text)
  button.type = 'button'

  return button
}

/** Build the hidden popup in a shadow root attached to the page. */
export function createTranslatorView(
  picker: ReturnType<typeof createLanguagePicker>
) {
  const host = make('div', '')
  host.id = 'shvyd-root'
  host.setAttribute('popover', 'manual')
  for (const [name, value] of Object.entries(HOST_STYLES)) {
    host.style.setProperty(name, value, 'important')
  }

  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = TRANSLATOR_STYLES

  const bubble = make('button', 'bubble')
  bubble.type = 'button'
  bubble.setAttribute('aria-label', 'Translate selected text')
  bubble.append(icon(TRANSLATE_ICON), make('span', 'bubble-label', 'Translate'))

  const copy = iconButton('Copy translation', 'Copy translation', COPY_ICON)
  const closeButton = iconButton('Close translation', 'Close', CLOSE_ICON)

  const dragHandle = make('span', 'spacer')
  dragHandle.title = 'Drag to move translation'

  const toolbar = make('div', 'toolbar')
  toolbar.append(picker.button, dragHandle, copy, closeButton)

  const loading = make('div', 'loading')
  loading.setAttribute('aria-hidden', 'true')

  const output = make('div', 'translation')
  output.setAttribute('aria-live', 'polite')

  // A hidden copy of the text box for measuring the selected text before its
  // translation arrives. Kept out of the live region so nothing is announced.
  const measure = make('div', 'translation measure')
  measure.setAttribute('aria-hidden', 'true')

  const status = make('div', 'status')
  status.setAttribute('role', 'status')

  const retry = textButton('Try again')
  const settings = textButton('Settings')
  const actions = make('div', 'actions')
  actions.append(retry, settings)

  const panel = make('section', 'panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Selected text translation')
  panel.append(toolbar, loading, output, status, actions, measure)

  // Pointer-only, like moving the window by its toolbar. The handles reach past
  // the panel's border, so they sit beside it, outside its scroll clipping.
  const resizeHandles = RESIZE_HANDLES.map((handle) => {
    const element = make('div', 'resize-handle')
    element.dataset.handle = handle
    element.setAttribute('aria-hidden', 'true')

    return { handle, element }
  })

  const frame = make('div', 'window')
  frame.append(panel, ...resizeHandles.map(({ element }) => element))

  bubble.hidden = true
  panel.hidden = true
  root.append(style, bubble, frame, picker.menu)
  document.documentElement.append(host)

  return {
    host,
    root,
    bubble,
    frame,
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
  }
}
