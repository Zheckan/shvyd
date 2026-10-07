import {
  LANGUAGES,
  languageTitle,
  supportedLanguages,
  supportsLanguage,
  type Language,
  type Provider,
} from '@/domain/languages/languages'
import {
  DEFAULT_SETTINGS,
  initialTarget,
  parsePreferences,
  publicPreferences,
  type Preferences,
} from '@/domain/settings/settings'

const TEMPLATE = `
  <div class="row language-mode-row">
    <label>
      Starting language
      <select name="targetMode">
        <option value="last">Remember last used</option>
        <option value="fixed">Always use a default</option>
      </select>
    </label>
    <label>
      <span class="target-label">Translate to</span>
      <select name="target"></select>
    </label>
  </div>
  <p class="hint target-mode-hint"></p>

  <h3>Your preferred languages</h3>
  <p class="hint">
    These appear first in the popup. Search by name or language code.
    Choices for other providers stay saved.
  </p>
  <div class="preferred-chips" aria-label="Chosen languages"></div>
  <label>
    Find languages
    <input
      class="favorite-search"
      type="search"
      placeholder="Search languages"
      aria-label="Search preferred languages"
    >
  </label>
  <div class="favorite-list" role="group" aria-label="Choose preferred languages"></div>
  <label class="toggle">
    <input name="showOtherLanguages" type="checkbox">
    <span>
      Show “More languages” in the popup
      <small>Keep access to the full list alongside your preferred languages.</small>
    </span>
  </label>
`

const COMPACT_TEMPLATE = `
  <div class="row language-mode-row">
    <div>
      <span class="field-label" id="starting-language-label">Starting language</span>
      <select name="targetMode" hidden aria-hidden="true" tabindex="-1">
        <option value="last">Remember last used</option>
        <option value="fixed">Always use a default</option>
      </select>
      <div class="segments" role="group" aria-labelledby="starting-language-label">
        <button type="button" data-mode="last" aria-pressed="true">Remember last used</button>
        <button type="button" data-mode="fixed" aria-pressed="false">Always use a default</button>
      </div>
    </div>
    <label><span class="target-label">Translate to</span><select name="target"></select></label>
  </div>
  <p class="hint target-mode-hint"></p>
  <p class="language-notice" role="status" hidden></p>
  <hr>
  <div class="preferred-section">
    <label for="preferred-language-search">Preferred languages</label>
    <p class="hint">These appear first in the popup. Type to add; Backspace removes the last one. Choices for other providers stay saved.</p>
    <div class="favorite-picker">
      <div class="chip-field">
        <div class="preferred-chips" aria-label="Chosen languages"></div>
        <input id="preferred-language-search" class="favorite-search" type="search" placeholder="Add a language…" aria-label="Search preferred languages" aria-controls="preferred-language-matches" aria-expanded="false" autocomplete="off">
      </div>
      <div id="preferred-language-matches" class="favorite-list" role="group" aria-label="Choose preferred languages" hidden></div>
    </div>
  </div>
  <label class="toggle">
    <span><strong>Show “More languages” in the popup</strong><small>Keep the full searchable list below your preferred ones.</small></span>
    <input class="switch" name="showOtherLanguages" type="checkbox">
  </label>
`

export function mountLanguageSettings(
  container: HTMLElement,
  options: { compact?: boolean; onChange?: () => void } = {}
) {
  container.innerHTML = options.compact ? COMPACT_TEMPLATE : TEMPLATE

  function required<T extends Element>(
    selector: string,
    constructor: { new (...args: never[]): T }
  ): T {
    const element = container.querySelector(selector)
    if (!(element instanceof constructor)) {
      throw new Error('Language settings could not load.')
    }

    return element
  }

  const mode = required('[name=targetMode]', HTMLSelectElement)
  const target = required('[name=target]', HTMLSelectElement)
  const showOther = required('[name=showOtherLanguages]', HTMLInputElement)
  const search = required('.favorite-search', HTMLInputElement)
  const list = required('.favorite-list', HTMLDivElement)
  const chips = required('.preferred-chips', HTMLDivElement)
  const hint = required('.target-mode-hint', HTMLParagraphElement)
  const targetLabel = required('.target-label', HTMLSpanElement)
  const notice = container.querySelector<HTMLElement>('.language-notice')

  let preferences: Preferences = publicPreferences(DEFAULT_SETTINGS)
  let favorites: Language[] = []

  function renderTarget(): void {
    target.replaceChildren(
      ...supportedLanguages(preferences.provider).map((language) => {
        const option = document.createElement('option')
        option.value = language.code
        option.textContent = languageTitle(language.code)

        return option
      })
    )

    target.value = initialTarget(preferences)

    for (const button of container.querySelectorAll<HTMLButtonElement>(
      '[data-mode]'
    )) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.mode === preferences.targetMode)
      )
    }

    if (preferences.targetMode === 'fixed') {
      targetLabel.textContent = 'Default language'
      hint.textContent =
        'Every new popup starts with this default. A change inside the popup lasts until you close it.'
    } else {
      targetLabel.textContent = 'Last used language'
      hint.textContent =
        'The popup remembers the last language you translated to.'
    }
  }

  function choose(code: Language, selected: boolean): void {
    if (options.compact && !selected && favorites.length === 1) {
      if (notice) {
        notice.hidden = false
        notice.textContent = 'Keep at least one preferred language.'
      }

      return
    }

    if (notice) {
      notice.hidden = true
    }

    favorites = selected
      ? [...favorites, code]
      : favorites.filter((value) => value !== code)
    favorites = [...new Set(favorites)]

    renderFavorites()

    if (options.compact) {
      search.value = ''
      search.focus()
      renderFavorites()
    }

    options.onChange?.()
  }

  function renderFavorites(): void {
    chips.replaceChildren(
      ...favorites.map((code) => {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'language-chip'
        const text = document.createElement('span')
        text.textContent = languageTitle(code)
        const remove = document.createElement('span')
        remove.className = 'remove-symbol'
        remove.textContent = '×'
        remove.setAttribute('aria-hidden', 'true')
        chip.append(text, remove)
        chip.setAttribute(
          'aria-label',
          `Remove ${languageTitle(code)} from preferred languages`
        )

        chip.addEventListener('click', () => choose(code, false))

        return chip
      })
    )

    const query = search.value.trim().toLocaleLowerCase()
    // Names that start with the query rank above names that merely contain it.
    function rank(language: (typeof LANGUAGES)[number]): number {
      return [language.name, language.label, language.code].some((text) =>
        text.toLocaleLowerCase().startsWith(query)
      )
        ? 0
        : 1
    }

    const allMatches = LANGUAGES.filter(
      (language) =>
        (!options.compact || !favorites.includes(language.code)) &&
        `${language.name} ${language.label} ${language.code}`
          .toLocaleLowerCase()
          .includes(query)
    ).sort((a, b) => rank(a) - rank(b))
    const matches = options.compact ? allMatches.slice(0, 6) : allMatches

    list.replaceChildren(
      ...matches.map((language) => {
        if (options.compact) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'favorite-choice'
          button.dataset.language = language.code
          const text = document.createElement('span')
          text.textContent = languageTitle(language.code)

          if (!supportsLanguage(language.code, preferences.provider)) {
            const note = document.createElement('small')
            note.textContent = 'Available with the other provider'
            text.append(note)
          }

          const code = document.createElement('code')
          code.textContent = language.code.toUpperCase()
          button.append(text, code)
          button.addEventListener('click', () => choose(language.code, true))

          return button
        }

        const label = document.createElement('label')
        label.className = 'favorite-choice'

        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.value = language.code
        checkbox.checked = favorites.includes(language.code)
        checkbox.addEventListener('change', () =>
          choose(language.code, checkbox.checked)
        )

        const text = document.createElement('span')
        text.textContent = languageTitle(language.code)
        if (!supportsLanguage(language.code, preferences.provider)) {
          const note = document.createElement('small')
          note.textContent = 'Available with the other provider'
          text.append(note)
        }

        label.append(checkbox, text)

        return label
      })
    )

    if (!matches.length) {
      list.textContent = 'No matching languages.'
    }
  }

  function syncTarget(): void {
    if (preferences.targetMode === 'fixed') {
      preferences.defaultTarget = target.value
    } else {
      preferences.target = target.value
    }
  }

  function fill(value: Preferences): void {
    preferences = structuredClone(value)
    favorites = [...value.favoriteLanguages]
    mode.value = value.targetMode
    showOther.checked = value.showOtherLanguages

    renderTarget()
    renderFavorites()
  }

  mode.addEventListener('change', () => {
    syncTarget()
    preferences.targetMode = mode.value === 'fixed' ? 'fixed' : 'last'
    renderTarget()
    options.onChange?.()
  })

  target.addEventListener('change', () => {
    syncTarget()
    options.onChange?.()
  })
  showOther.addEventListener('change', () => options.onChange?.())
  search.addEventListener('input', renderFavorites)

  if (options.compact) {
    function setListOpen(open: boolean): void {
      list.hidden = !open
      search.setAttribute('aria-expanded', String(open))
    }

    search.addEventListener('focus', () => setListOpen(true))
    container.addEventListener('focusout', (event) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !container
          .querySelector('.favorite-picker')
          ?.contains(event.relatedTarget)
      ) {
        setListOpen(false)
      }
    })
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (
          event.target === search ||
          (event.target instanceof Node && list.contains(event.target))
        ) {
          search.focus()
        }

        setListOpen(false)

        return
      }

      if (event.target !== search) {
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setListOpen(true)
        list.querySelector<HTMLButtonElement>('button')?.focus()
      } else if (event.key === 'Enter') {
        event.preventDefault()

        if (!list.hidden) {
          list.querySelector<HTMLButtonElement>('button')?.click()
        }
      } else if (event.key === 'Backspace' && !search.value) {
        const last = favorites.at(-1)

        if (last) {
          choose(last, false)
        }
      }
    })

    for (const button of container.querySelectorAll<HTMLButtonElement>(
      '[data-mode]'
    )) {
      button.addEventListener('click', () => {
        mode.value = button.dataset.mode ?? 'last'
        mode.dispatchEvent(new Event('change'))
      })
    }
  }

  fill(preferences)

  return {
    fill,
    read(): Preferences {
      syncTarget()

      return parsePreferences({
        ...preferences,
        favoriteLanguages: favorites,
        showOtherLanguages: showOther.checked,
      })
    },
    setProvider(provider: Provider): void {
      syncTarget()
      const previous = initialTarget(preferences)
      preferences = parsePreferences({
        ...preferences,
        provider,
        favoriteLanguages: favorites.length
          ? favorites
          : preferences.favoriteLanguages,
      })

      renderTarget()
      renderFavorites()

      if (notice) {
        const fallback = initialTarget(preferences)
        notice.hidden = previous === fallback
        notice.textContent = `${languageTitle(previous)} is unavailable with ${provider === 'azure' ? 'Azure' : 'DeepL'}. New popups will use ${languageTitle(fallback)}.`
      }
    },
  }
}
