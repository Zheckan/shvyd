import {
  isProvider,
  parsePreferences,
  type Preferences,
} from '@/domain/settings/settings'
import { parseSite } from '@/domain/sites/sites'
import { unwrapResponse } from '@/domain/translation/translation-client'
import { applyTheme, readSavedTheme } from '@/ui/savedTheme'
import { isRecord } from '@/utils/isRecord'
import { requireIn } from '@/utils/requireIn'
import { quickTargets, targetChange } from './logic/quickTargets'

type QuickState = {
  preferences: Preferences
  providers: { azure: boolean; deepl: boolean }
}

function parseQuickState(value: unknown): QuickState {
  if (
    !isRecord(value) ||
    !isRecord(value.providers) ||
    typeof value.providers.azure !== 'boolean' ||
    typeof value.providers.deepl !== 'boolean'
  ) {
    throw new Error('Quick settings could not be read.')
  }

  return {
    preferences: parsePreferences(value.preferences),
    providers: { azure: value.providers.azure, deepl: value.providers.deepl },
  }
}

function parseSiteReply(value: unknown): string | undefined {
  try {
    return isRecord(value) ? parseSite(value.site) : undefined
  } catch {
    return undefined
  }
}

/** The menu that opens from Shvyd's toolbar icon. */
export function mountQuickSettings({
  send,
  askActiveTab,
  openSettings,
  version,
}: {
  send: (request: unknown) => Promise<unknown>
  /** Sends a message to the page in the active tab; rejects if Shvyd is not there. */
  askActiveTab: (message: unknown) => Promise<unknown>
  openSettings: () => void
  version: string
}): void {
  const required = requireIn(document)
  const siteName = required('#site-name', HTMLElement)
  const siteHint = required('#site-hint', HTMLElement)
  const siteEnabled = required('#site-enabled', HTMLInputElement)
  const target = required('#quick-target', HTMLSelectElement)
  const adapt = required('#quick-adapt', HTMLInputElement)
  const status = required('#quick-status', HTMLOutputElement)
  const providerButtons =
    document.querySelectorAll<HTMLButtonElement>('[data-provider]')
  const anchorButtons =
    document.querySelectorAll<HTMLButtonElement>('[data-anchor]')
  let state: QuickState | undefined
  let site: string | undefined

  applyTheme(readSavedTheme())
  required('#version', HTMLElement).textContent = `v${version}`

  async function call(request: unknown): Promise<unknown> {
    return unwrapResponse(await send(request))
  }

  function report(error: unknown): void {
    status.dataset.state = 'error'
    status.textContent =
      error instanceof Error ? error.message : 'Shvyd could not save that.'
  }

  function press(buttons: NodeListOf<HTMLButtonElement>, value: string): void {
    for (const button of buttons) {
      const choice = button.dataset.provider ?? button.dataset.anchor
      button.setAttribute('aria-pressed', String(choice === value))
    }
  }

  function render(): void {
    if (!state) {
      return
    }

    const { preferences, providers } = state
    press(providerButtons, preferences.provider)
    press(anchorButtons, preferences.popupAnchor)

    for (const button of providerButtons) {
      const provider = button.dataset.provider
      button.disabled = !isProvider(provider) || !providers[provider]
      button.title = button.disabled ? 'Add a key in all settings first' : ''
    }

    target.replaceChildren(
      ...quickTargets(preferences).map((option) => {
        const element = document.createElement('option')
        element.value = option.code
        element.textContent = option.label
        element.selected = option.selected
        return element
      })
    )
    adapt.checked = preferences.adaptToPage
  }

  async function update(change: Partial<Preferences>): Promise<void> {
    if (!state) {
      return
    }

    try {
      const preferences = parsePreferences(
        await call({ kind: 'update-preferences', value: change })
      )
      state = { ...state, preferences }
      delete status.dataset.state
      status.textContent = ''
      render()
    } catch (error) {
      report(error)
      render()
    }
  }

  function renderSite(hidden: boolean): void {
    siteEnabled.checked = !hidden
    siteHint.textContent = hidden
      ? 'Off here: no Translate button on this site.'
      : 'Shows the Translate button when you select text.'
  }

  async function loadSite(): Promise<void> {
    site = parseSiteReply(
      await askActiveTab({ kind: 'get-site' }).catch(() => undefined)
    )

    if (!site) {
      siteName.textContent = 'This page'
      siteHint.textContent =
        'Shvyd cannot run here. Browser pages, stores, and PDFs are not supported.'
      siteEnabled.disabled = true
      return
    }

    siteName.textContent = site
    const reply = await call({ kind: 'site-status', site })
    renderSite(isRecord(reply) && reply.hidden === true)
    siteEnabled.disabled = false
  }

  siteEnabled.addEventListener('change', async () => {
    if (!site) {
      return
    }

    const show = siteEnabled.checked
    siteEnabled.disabled = true

    try {
      await call({ kind: show ? 'show-site' : 'hide-site', site })
      renderSite(!show)
    } catch (error) {
      renderSite(show)
      report(error)
    } finally {
      siteEnabled.disabled = false
    }
  })

  for (const button of providerButtons) {
    button.addEventListener('click', () => {
      if (isProvider(button.dataset.provider)) {
        void update({ provider: button.dataset.provider })
      }
    })
  }

  for (const button of anchorButtons) {
    button.addEventListener('click', () => {
      const anchor = button.dataset.anchor

      if (anchor === 'cursor' || anchor === 'selection') {
        void update({ popupAnchor: anchor })
      }
    })
  }

  target.addEventListener('change', () => {
    if (state) {
      void update(targetChange(state.preferences, target.value))
    }
  })

  adapt.addEventListener('change', () => {
    void update({ adaptToPage: adapt.checked })
  })

  required('#open-settings', HTMLButtonElement).addEventListener(
    'click',
    openSettings
  )

  void call({ kind: 'quick-settings' })
    .then((value) => {
      state = parseQuickState(value)
      render()
    })
    .catch(report)
  void loadSite().catch(report)
}
