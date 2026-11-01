import {
  getLanguage,
  languageLabel,
  languageTitle,
  supportedLanguages,
  supportsLanguage,
  type Language,
} from '@/domain/languages/languages'
import {
  DEFAULT_SETTINGS,
  initialTarget,
  publicPreferences,
  type Preferences,
} from '@/domain/settings/settings'
import { requireIn } from '@/utils/requireIn'

const PAGES = {
  editorial: {
    label: 'Editorial',
    bg: '#fff3ec',
    card: '#fffaf6',
    text: '#4a3128',
    head: '#5b3a2e',
    accent: '#b4432a',
    border: '#efd6ca',
    radius: '18px',
    dark: false,
    selection: '#b4432a2e',
    shadow: '0 18px 50px #783c2829',
  },
  technical: {
    label: 'Technical',
    bg: '#0b1117',
    card: '#111922',
    text: '#d5dee8',
    head: '#eef3f8',
    accent: '#62b0f0',
    border: '#26323f',
    radius: '6px',
    dark: true,
    selection: '#62b0f047',
    shadow: '0 8px 30px #00000052',
  },
  forest: {
    label: 'Forest',
    bg: '#e6eee3',
    card: '#f5f8f3',
    text: '#21352a',
    head: '#1b2c22',
    accent: '#2f6d4f',
    border: '#c8d7cb',
    radius: '10px',
    dark: false,
    selection: '#2f6d4f33',
    shadow: '0 8px 30px #0000001f',
  },
}

const SAMPLES: Record<Language, string> = {
  uk: 'Найшвидші інструменти розчиняються в завданні. Виділіть речення, зрозумійте його й читайте далі.',
  en: 'The quickest tools disappear into the task. Select a sentence, get its meaning, and carry on.',
  pl: 'Najszybsze narzędzia znikają w zadaniu. Zaznacz zdanie, poznaj jego sens i czytaj dalej.',
  de: 'Die schnellsten Werkzeuge verschwinden in der Aufgabe. Markiere einen Satz, verstehe ihn und lies weiter.',
  fr: 'Les outils les plus rapides s’effacent derrière la tâche. Sélectionnez une phrase, comprenez-la et poursuivez.',
  es: 'Las herramientas más rápidas desaparecen en la tarea. Selecciona una frase, entiéndela y sigue leyendo.',
  it: 'Gli strumenti più rapidi scompaiono nel compito. Seleziona una frase, capiscila e continua a leggere.',
  pt: 'As ferramentas mais rápidas desaparecem na tarefa. Selecione uma frase, entenda-a e continue lendo.',
  nl: 'De snelste hulpmiddelen verdwijnen in de taak. Selecteer een zin, begrijp hem en lees verder.',
  cs: 'Nejrychlejší nástroje mizí v úkolu. Označte větu, pochopte ji a čtěte dál.',
  tr: 'En hızlı araçlar işin içinde kaybolur. Bir cümle seçin, anlamını öğrenin ve okumaya devam edin.',
  ja: '最も速い道具は、作業の中に消えていく。文を選び、意味をつかみ、そのまま読み進めよう。',
  ko: '가장 빠른 도구는 작업 속으로 사라진다. 문장을 선택하고, 뜻을 파악하고, 계속 읽으세요.',
  'zh-hans': '最快的工具会融入任务之中。选中一句话，理解它，然后继续阅读。',
  ar: 'أسرع الأدوات تختفي في المهمة. حدّد جملة، وافهم معناها، وتابع القراءة.',
}

export function mountSettingsPreview(container: HTMLElement) {
  container.innerHTML = `
    <section class="card preview-card">
      <div class="preview-heading"><h2>Live preview</h2><div class="preview-pages" role="group" aria-label="Preview page style"></div></div>
      <div class="preview-stage">
        <div class="preview-article">
          <div class="eyebrow">Selection playground</div>
          <h3>A quieter way to read.</h3>
          <p><span class="preview-selection">The quickest tools disappear into the task.</span> Select a sentence, get its meaning, and carry on without losing your place.</p>
          <p>A translation window should feel like part of the page: its paper colour, subtle border and corners.</p>
        </div>
        <section class="preview-popup" aria-label="Sample translation">
          <div class="preview-toolbar">
            <button type="button" class="preview-target" aria-haspopup="menu" aria-controls="preview-language-menu" aria-expanded="false"></button>
            <span class="preview-icons" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8h12v13H8zM16 8V3H3v13h5"></path></svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
            </span>
          </div>
          <div class="preview-translation"></div>
          <div class="preview-menu" id="preview-language-menu" role="menu" aria-label="Preview languages" hidden></div>
        </section>
      </div>
      <p class="preview-caption"></p>
    </section>
  `

  const required = requireIn(container)

  const pages = required('.preview-pages', HTMLDivElement)
  const stage = required('.preview-stage', HTMLDivElement)
  const targetButton = required('.preview-target', HTMLButtonElement)
  const translation = required('.preview-translation', HTMLDivElement)
  const menu = required('.preview-menu', HTMLDivElement)
  const caption = required('.preview-caption', HTMLParagraphElement)
  let page: keyof typeof PAGES = 'editorial'
  let preferences = publicPreferences(DEFAULT_SETTINGS)
  let target = initialTarget(preferences)

  function closeMenu(): void {
    menu.hidden = true
    targetButton.setAttribute('aria-expanded', 'false')
  }

  function option(code: Language): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = languageTitle(code)
    button.setAttribute('role', 'menuitemradio')
    button.setAttribute('aria-checked', String(code === target))
    button.addEventListener('click', () => {
      target = code
      closeMenu()
      render()
      targetButton.focus()
    })

    return button
  }

  function renderMenu(): void {
    const preferred = preferences.favoriteLanguages.filter((code) =>
      supportsLanguage(code, preferences.provider)
    )

    if (!preferred.includes(target)) {
      preferred.unshift(target)
    }

    menu.replaceChildren(...preferred.map(option))

    if (!preferences.showOtherLanguages) {
      return
    }

    const more = document.createElement('button')
    more.type = 'button'
    more.textContent = 'More languages'
    more.setAttribute('role', 'menuitem')
    more.setAttribute('aria-expanded', 'false')
    const additional = document.createElement('div')
    additional.hidden = true
    const search = document.createElement('input')
    search.type = 'search'
    search.placeholder = 'Search all languages'
    search.setAttribute('aria-label', 'Search preview languages')
    const matches = document.createElement('div')

    function filter(): void {
      const query = search.value.trim().toLocaleLowerCase()
      matches.replaceChildren(
        ...supportedLanguages(preferences.provider)
          .filter((language) =>
            `${languageTitle(language.code)} ${language.code}`
              .toLocaleLowerCase()
              .includes(query)
          )
          .map((language) => option(language.code))
      )

      if (!matches.childElementCount) {
        matches.textContent = 'No matching languages.'
      }
    }

    more.addEventListener('click', () => {
      additional.hidden = !additional.hidden
      more.setAttribute('aria-expanded', String(!additional.hidden))
      filter()

      if (!additional.hidden) {
        search.focus()
      }
    })
    search.addEventListener('input', filter)
    additional.append(search, matches)
    menu.append(more, additional)
  }

  function render(): void {
    const sample = PAGES[page]
    const neutral = sample.dark
      ? {
          bg: '#1c1d20',
          text: '#f5f5f5',
          accent: '#f5f5f5',
          border: '#454648',
          radius: '12px',
          shadow: '0 8px 30px #00000052',
        }
      : {
          bg: '#fff',
          text: '#18181b',
          accent: '#18181b',
          border: '#d5d5d6',
          radius: '12px',
          shadow: '0 8px 30px #0000001f',
        }
    const popup = preferences.adaptToPage
      ? { ...sample, bg: sample.card }
      : neutral
    const tokens = {
      'sample-bg': sample.bg,
      'sample-card': sample.card,
      'sample-border': sample.border,
      'sample-text': sample.text,
      'sample-head': sample.head,
      'sample-radius': sample.radius,
      'sample-selection': sample.selection,
      'popup-bg': popup.bg,
      'popup-text': popup.text,
      'popup-accent': popup.accent,
      'popup-border': popup.border,
      'popup-radius': popup.radius,
      'popup-shadow': popup.shadow,
    }

    for (const [name, value] of Object.entries(tokens)) {
      stage.style.setProperty(`--${name}`, value)
    }

    for (const button of pages.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.page === page))
    }

    targetButton.textContent = `${languageLabel(target)} ▾`
    targetButton.setAttribute(
      'aria-label',
      `Preview language: ${languageTitle(target)}`
    )
    translation.textContent =
      SAMPLES[target] ??
      `Sample translation preview for ${languageTitle(target)}. The extension supports this language; this preview has no prepared translation for it.`
    translation.dir = SAMPLES[target]
      ? (getLanguage(target)?.direction ?? 'ltr')
      : 'ltr'
    caption.textContent = `${preferences.provider === 'azure' ? 'Azure' : 'DeepL'} · ${preferences.targetMode === 'fixed' ? 'fixed default' : 'remembers last'} · ${preferences.adaptToPage ? 'matches the page' : 'neutral style'}. Sample only. Click the language to try the menu.`
    renderMenu()
  }

  for (const [id, sample] of Object.entries(PAGES)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'preview-page-button'
    button.dataset.page = id
    button.textContent = sample.label
    button.addEventListener('click', () => {
      if (id === 'editorial' || id === 'technical' || id === 'forest') {
        page = id
      }

      closeMenu()
      render()
    })
    pages.append(button)
  }

  targetButton.addEventListener('click', () => {
    menu.hidden = !menu.hidden
    targetButton.setAttribute('aria-expanded', String(!menu.hidden))

    if (!menu.hidden) {
      menu.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus()
    }
  })
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu()
      targetButton.focus()
    }
  })
  container.addEventListener('focusout', (event) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !container.contains(event.relatedTarget)
    ) {
      closeMenu()
    }
  })
  document.addEventListener('pointerdown', (event) => {
    if (
      event.target instanceof Node &&
      !menu.contains(event.target) &&
      !targetButton.contains(event.target)
    ) {
      closeMenu()
    }
  })

  render()

  return {
    update(value: Preferences): void {
      preferences = structuredClone(value)
      target = initialTarget(preferences)
      closeMenu()
      render()
    },
  }
}
