import { TRANSLATOR_STYLES } from '../translatorStyles'
import type { createLanguagePicker } from './createLanguagePicker'
import { icon, make } from './elements'

const TRANSLATE_ICON =
  'M4 5h11M10 3v2M6 5c0 6 5 9 9 11M14 5c0 6-5 9-10 11M14 21l4-10 4 10M15.5 17h5'
const COPY_ICON = 'M8 8h12v13H8zM16 8V3H3v13h5'
const CLOSE_ICON = 'M6 6l12 12M18 6 6 18'
const RESIZE_ICON = 'M20 11 11 20M20 17l-3 3'

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
  bubble.append(icon(TRANSLATE_ICON), document.createTextNode('Translate'))

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

  const status = make('div', 'status')
  status.setAttribute('role', 'status')

  const retry = textButton('Try again')
  const settings = textButton('Settings')
  const actions = make('div', 'actions')
  actions.append(retry, settings)

  // Pointer-only, like moving the window by its toolbar.
  const resizeGrip = make('div', 'resize-grip')
  resizeGrip.title = 'Drag to resize. Double-click for the default size.'
  resizeGrip.append(icon(RESIZE_ICON))

  const panel = make('section', 'panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Selected text translation')
  panel.append(toolbar, loading, output, status, actions, resizeGrip)

  bubble.hidden = true
  panel.hidden = true
  root.append(style, bubble, panel, picker.menu)
  document.documentElement.append(host)

  return {
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
    resizeGrip,
  }
}
