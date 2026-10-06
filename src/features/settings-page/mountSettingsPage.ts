import {
  isProvider,
  parseSettings,
  publicPreferences,
  settingsFromEnv,
  type Settings,
} from '@/domain/settings/settings'
import { parseConnectionResult } from '@/domain/translation/testConnection'
import { unwrapResponse } from '@/domain/translation/translation-client'
import { mountLanguageSettings } from '@/features/language-settings/mountLanguageSettings'
import { parseEnvFile } from '@/utils/parseEnvFile'
import { createSettingsSaver, type SaveState } from './createSettingsSaver'
import { mountSettingsPreview } from './mountSettingsPreview'

export function mountSettingsPage(
  send: (request: unknown) => Promise<unknown>
): void {
  function required<T extends HTMLElement>(
    selector: string,
    constructor: { new (...args: never[]): T }
  ): T {
    const element = document.querySelector(selector)

    if (!(element instanceof constructor)) {
      throw new Error('Settings could not load.')
    }

    return element
  }

  const form = required('#settings', HTMLFormElement)
  const fields = required('#settings-fields', HTMLFieldSetElement)
  const status = required('#status', HTMLOutputElement)
  const statusContainer = required('.save-status', HTMLDivElement)
  const retry = required('#retry-save', HTMLButtonElement)
  const summary = required('#key-summary', HTMLSpanElement)
  const envFile = required('#import-env', HTMLInputElement)
  const preview = mountSettingsPreview(
    required('#settings-preview', HTMLElement)
  )
  let loaded = false
  let validationError = false
  let saveState: SaveState = { kind: 'saved' }

  async function call(request: unknown): Promise<unknown> {
    return unwrapResponse(await send(request))
  }

  const saver = createSettingsSaver({
    save: async (value) => {
      parseSettings(await call({ kind: 'save-settings', value }))
    },
    onState: (state) => {
      saveState = state
      updateKeyLabels()

      if (validationError) {
        return
      }

      statusContainer.dataset.state = state.kind
      retry.hidden = state.kind !== 'error'

      switch (state.kind) {
        case 'pending':
          status.textContent = 'Unsaved changes…'
          break
        case 'saving':
          status.textContent = 'Saving…'
          break
        case 'saved':
          status.textContent = 'All changes saved'
          break
        case 'error':
          status.textContent = state.message
          break
      }
    },
  })
  const languageSettings = mountLanguageSettings(
    required('#language-settings', HTMLDivElement),
    { compact: true, onChange: changed }
  )

  function input(name: string): HTMLInputElement {
    const element = form.elements.namedItem(name)

    if (!(element instanceof HTMLInputElement)) {
      throw new Error('Settings could not load.')
    }

    return element
  }

  function radio(name: string): string {
    const element = form.querySelector<HTMLInputElement>(
      `input[name="${name}"]:checked`
    )

    if (!element) {
      throw new Error('Choose a settings option.')
    }

    return element.value
  }

  function selectRadio(name: string, value: string): void {
    for (const element of form.querySelectorAll<HTMLInputElement>(
      `input[name="${name}"]`
    )) {
      element.checked = element.value === value
    }
  }

  function fill(settings: Settings): void {
    selectRadio('provider', settings.provider)
    languageSettings.fill(settings)
    input('adaptToPage').checked = settings.adaptToPage
    input('azureKey').value = settings.azure.key
    input('azureRegion').value = settings.azure.region
    input('deeplKey').value = settings.deepl.key
    selectRadio('deeplEndpoint', settings.deepl.endpoint)
    updateKeyLabels()
    preview.update(publicPreferences(settings))
  }

  function read(): Settings {
    return parseSettings({
      ...languageSettings.read(),
      provider: radio('provider'),
      adaptToPage: input('adaptToPage').checked,
      azure: {
        key: input('azureKey').value,
        region: input('azureRegion').value.trim(),
      },
      deepl: { key: input('deeplKey').value, endpoint: radio('deeplEndpoint') },
    })
  }

  function updateKeyLabels(): void {
    const labels: string[] = []

    for (const provider of ['azure', 'deepl'] as const) {
      const hasKey = !!input(`${provider}Key`).value.trim()
      const state = required(`[data-key-state="${provider}"]`, HTMLSpanElement)
      state.textContent = hasKey ? 'Key added' : 'Needs a key'
      state.dataset.ready = String(hasKey)
      const result = required(`#${provider}-test-status`, HTMLOutputElement)

      if (!result.dataset.state) {
        const keyState = saveState.kind === 'saved' ? 'Key saved' : 'Key added'
        result.textContent = hasKey
          ? `${keyState} · not verified`
          : 'No key yet'
      }

      if (hasKey) {
        labels.push(`${provider === 'azure' ? 'Azure' : 'DeepL'} key added`)
      }
    }

    summary.textContent = labels.join(' · ') || 'No keys yet'
  }

  function changed(): void {
    if (!loaded) {
      return
    }

    try {
      const settings = read()
      validationError = false
      input('azureRegion').removeAttribute('aria-invalid')
      saver.schedule(settings)
      preview.update(publicPreferences(settings))
    } catch (error) {
      validationError = true
      statusContainer.dataset.state = 'error'
      status.textContent =
        error instanceof Error ? error.message : 'Check the settings fields.'
      retry.hidden = true
      input('azureRegion').setAttribute(
        'aria-invalid',
        String(!/^[a-z0-9-]{0,64}$/i.test(input('azureRegion').value.trim()))
      )
    }
  }

  for (const element of form.querySelectorAll<HTMLInputElement>(
    '[name=provider]'
  )) {
    element.addEventListener('change', () => {
      if (isProvider(element.value)) {
        languageSettings.setProvider(element.value)
        changed()
      }
    })
  }

  input('adaptToPage').addEventListener('change', changed)

  for (const element of form.querySelectorAll<HTMLInputElement>(
    '[name=azureKey], [name=azureRegion], [name=deeplKey], [name=deeplEndpoint]'
  )) {
    element.addEventListener('input', () => {
      const provider = element.name.startsWith('azure') ? 'azure' : 'deepl'
      const result = required(`#${provider}-test-status`, HTMLOutputElement)
      delete result.dataset.state
      result.removeAttribute('data-fingerprint')
      changed()
    })
  }

  for (const button of form.querySelectorAll<HTMLButtonElement>(
    '[data-show-key]'
  )) {
    button.addEventListener('click', () => {
      const name = button.dataset.showKey

      if (!name) {
        return
      }

      const field = input(name)
      const visible = field.type === 'password'
      field.type = visible ? 'text' : 'password'
      button.textContent = visible ? 'Hide' : 'Show'
      button.setAttribute('aria-pressed', String(visible))
      button.setAttribute(
        'aria-label',
        `${visible ? 'Hide' : 'Show'} ${name === 'azureKey' ? 'Azure' : 'DeepL'} key`
      )
    })
  }

  for (const button of form.querySelectorAll<HTMLButtonElement>(
    '[data-test-provider]'
  )) {
    button.addEventListener('click', async () => {
      const provider = button.dataset.testProvider

      if (!isProvider(provider)) {
        return
      }

      const result = required(`#${provider}-test-status`, HTMLOutputElement)
      let tested: string | undefined

      try {
        const settings = read()
        tested = JSON.stringify(settings[provider])
        result.dataset.state = 'testing'
        result.textContent = 'Testing…'
        button.disabled = true
        const response = parseConnectionResult(
          await call({ kind: 'test-connection', provider, value: settings })
        )

        if (
          JSON.stringify(read()[provider]) === tested &&
          result.dataset.state === 'testing'
        ) {
          result.dataset.state = 'success'
          result.textContent = `Connected · ${response.durationMs} ms`
        }
      } catch (error) {
        // A response for an edited key must never mark the new key as verified.
        if (result.dataset.state === 'testing' || tested === undefined) {
          result.dataset.state = 'error'
          result.textContent =
            error instanceof Error ? error.message : 'Connection test failed.'
        }
      } finally {
        button.disabled = false
      }
    })
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    changed()

    if (!validationError) {
      void saver.flush()
    }
  })

  envFile.addEventListener('change', async () => {
    const file = envFile.files?.[0]

    if (!file) {
      return
    }

    try {
      if (file.size > 64_000) {
        throw new Error("Choose the project's small .env file.")
      }

      const imported = settingsFromEnv(parseEnvFile(await file.text()))
      const settings = parseSettings({
        ...languageSettings.read(),
        provider: radio('provider'),
        adaptToPage: input('adaptToPage').checked,
        azure: imported.azure,
        deepl: imported.deepl,
      })

      for (const provider of ['azure', 'deepl']) {
        delete required(`#${provider}-test-status`, HTMLOutputElement).dataset
          .state
      }

      fill(settings)
      changed()
      await saver.flush()
    } catch (error) {
      statusContainer.dataset.state = 'error'
      status.textContent =
        error instanceof Error
          ? error.message
          : 'The file could not be imported.'
    }

    envFile.value = ''
  })

  function theme(value: string): void {
    const selected = ['light', 'dark', 'auto'].includes(value) ? value : 'auto'
    document.documentElement.dataset.theme = selected

    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-theme-choice]'
    )) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.themeChoice === selected)
      )
    }
  }

  try {
    theme(localStorage.getItem('shvyd-settings-theme') ?? 'auto')
  } catch {
    theme('auto')
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-theme-choice]'
  )) {
    button.addEventListener('click', () => {
      const value = button.dataset.themeChoice ?? 'auto'
      theme(value)

      try {
        localStorage.setItem('shvyd-settings-theme', value)
      } catch {
        // Theme controls still work if the browser blocks local storage.
      }
    })
  }

  window.addEventListener('beforeunload', (event) => {
    if (saver.hasPending() || validationError) {
      void saver.flush()
      event.preventDefault()
      event.returnValue = ''
    }
  })

  void call({ kind: 'get-settings' })
    .then((value) => {
      fill(parseSettings(value))
      loaded = true
      fields.disabled = false
      statusContainer.dataset.state = 'saved'
      status.textContent = 'All changes saved'
    })
    .catch(() => {
      statusContainer.dataset.state = 'error'
      status.textContent = 'Settings could not load. Reload this tab.'
    })
}
