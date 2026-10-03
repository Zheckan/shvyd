import { languageLabel, languageTitle, supportedLanguages } from './languages'
import type { Language, Preferences } from './settings'

export function createLanguagePicker({
  onSelect,
  onResize,
}: {
  onSelect: (code: Language) => void
  onResize: () => void
}) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'target'
  button.setAttribute('aria-haspopup', 'listbox')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-controls', 'shvyd-language-menu')
  const menu = document.createElement('div')
  menu.className = 'language-menu'
  menu.id = 'shvyd-language-menu'
  menu.hidden = true
  const preferred = document.createElement('div')
  preferred.className = 'language-list'
  preferred.setAttribute('role', 'listbox')
  preferred.setAttribute('aria-label', 'Preferred languages')
  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'more-languages'
  more.textContent = 'More languages'
  more.setAttribute('aria-expanded', 'false')
  const expanded = document.createElement('div')
  expanded.hidden = true
  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'language-search'
  search.placeholder = 'Search all languages'
  search.setAttribute('aria-label', 'Search languages')
  const additional = document.createElement('div')
  additional.className = 'language-list'
  additional.setAttribute('role', 'listbox')
  additional.setAttribute('aria-label', 'Additional languages')
  expanded.append(search, additional)
  menu.append(preferred, more, expanded)
  let current: { preferences: Preferences; target: Language } | undefined

  function close(): void {
    menu.hidden = true
    expanded.hidden = true
    button.setAttribute('aria-expanded', 'false')
    more.setAttribute('aria-expanded', 'false')
    onResize()
  }
  function option(code: Language): HTMLButtonElement {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'language-option'
    item.dataset.language = code
    item.setAttribute('role', 'option')
    item.setAttribute('aria-selected', String(code === current?.target))
    item.textContent = languageTitle(code)
    item.addEventListener('click', () => {
      close()
      onSelect(code)
    })
    return item
  }
  function renderAdditional(): void {
    if (!current) return
    const query = search.value.trim().toLocaleLowerCase()
    const matches = supportedLanguages(current.preferences.provider).filter(
      (language) =>
        `${language.name} ${language.label} ${language.code}`
          .toLocaleLowerCase()
          .includes(query)
    )
    additional.replaceChildren(
      ...matches.map((language) => option(language.code))
    )
    if (!matches.length) additional.textContent = 'No matching languages.'
    onResize()
  }
  function update(value: { preferences: Preferences; target: Language }): void {
    current = value
    button.textContent = `${languageLabel(value.target)} ▾`
    button.setAttribute(
      'aria-label',
      `Translate to: ${languageTitle(value.target)}`
    )
    const available = supportedLanguages(value.preferences.provider)
    const codes = value.preferences.favoriteLanguages.filter((code) =>
      available.some((language) => language.code === code)
    )
    if (!codes.includes(value.target)) codes.unshift(value.target)
    preferred.replaceChildren(...codes.map(option))
    if (!codes.length)
      preferred.textContent =
        'No preferred languages available with this provider.'
    more.hidden = !value.preferences.showOtherLanguages
    search.value = ''
    if (!value.preferences.showOtherLanguages) expanded.hidden = true
    if (!expanded.hidden) renderAdditional()
  }
  button.addEventListener('click', () => {
    if (!menu.hidden) {
      close()
      return
    }
    menu.hidden = false
    button.setAttribute('aria-expanded', 'true')
    onResize()
    preferred.querySelector<HTMLButtonElement>('button')?.focus()
  })
  more.addEventListener('click', () => {
    expanded.hidden = !expanded.hidden
    more.setAttribute('aria-expanded', String(!expanded.hidden))
    if (!expanded.hidden) {
      renderAdditional()
      search.focus()
    }
    onResize()
  })
  search.addEventListener('input', renderAdditional)
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      button.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (
      event.target === search &&
      (event.key === 'Home' || event.key === 'End')
    )
      return
    const options = [
      ...menu.querySelectorAll<HTMLButtonElement>('button[role=option]'),
    ].filter((item) => !item.closest('[hidden]'))
    if (!options.length) return
    event.preventDefault()
    const index = options.findIndex((item) => item === event.target)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % options.length
            : (index - 1 + options.length) % options.length
    options[next]?.focus()
  })
  return { button, menu, update, close }
}
