import { createClient } from './client'
import { mountTranslator } from './popup'
import { isProvider, isRecord } from './settings'
import { mountLanguageSettings } from './language-settings'

const dialog = document.getElementById('demo-settings')
const languageContainer = document.getElementById('demo-language-settings')
const form = document.getElementById('demo-preferences')
const status = document.getElementById('demo-settings-status')
const adaptation = document.querySelector(
  '#demo-preferences [name="adaptToPage"]'
)
if (
  !(dialog instanceof HTMLDialogElement) ||
  !languageContainer ||
  !(form instanceof HTMLFormElement) ||
  !status ||
  !(adaptation instanceof HTMLInputElement)
)
  throw new Error('Demo settings could not load.')
const languageSettings = mountLanguageSettings(languageContainer)
const controls = { dialog, status, adaptation }

const client = createClient(async (request) => {
  if (isRecord(request) && request.kind === 'open-settings') {
    await openSettings()
    return { ok: true, data: null }
  }
  const response = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return response.json()
})
mountTranslator(client)
const provider = document.getElementById('demo-provider')
if (provider instanceof HTMLSelectElement) {
  void client.preferences().then((preferences) => {
    provider.value = preferences.provider
  })
  provider.addEventListener('change', () => {
    if (isProvider(provider.value)) {
      languageSettings.setProvider(provider.value)
      void client.updatePreferences({ provider: provider.value }).catch(() => {
        status.textContent = 'The provider could not be changed.'
      })
    }
  })
}
async function openSettings(): Promise<void> {
  const preferences = await client.preferences()
  languageSettings.fill(preferences)
  controls.adaptation.checked = preferences.adaptToPage
  controls.status.textContent = ''
  if (!controls.dialog.open) controls.dialog.showModal()
}
document.getElementById('open-demo-settings')?.addEventListener('click', () => {
  void openSettings()
})
document
  .getElementById('close-demo-settings')
  ?.addEventListener('click', () => {
    dialog.close()
  })
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const preferences = await client.updatePreferences({
      ...languageSettings.read(),
      adaptToPage: adaptation.checked,
    })
    languageSettings.fill(preferences)
    status.textContent = 'Saved. The next popup uses these settings.'
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Settings could not be saved.'
  }
})
for (const element of document.querySelectorAll<HTMLElement>('.demo-only'))
  element.hidden = false
const mode = document.getElementById('playground-mode')
if (mode)
  mode.textContent =
    'Live demo: translation uses your configured keys through the local server. Language settings here apply to the demo; the extension has its own settings.'
