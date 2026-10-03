import { unwrapResponse } from './client'
import {
  isProvider,
  parseEnvFile,
  parseSettings,
  settingsFromEnv,
  type Settings,
} from './settings'
import { mountLanguageSettings } from './language-settings'

const form = document.getElementById('settings')
const status = document.getElementById('status')
const details = document.getElementById('credentials')
const summary = document.getElementById('key-summary')
const envFile = document.getElementById('import-env')
const languageContainer = document.getElementById('language-settings')
if (
  !(form instanceof HTMLFormElement) ||
  !status ||
  !(details instanceof HTMLDetailsElement) ||
  !summary ||
  !(envFile instanceof HTMLInputElement) ||
  !languageContainer
)
  throw new Error('Settings could not load.')
const fields = form
const languageSettings = mountLanguageSettings(languageContainer)

function input(name: string): HTMLInputElement {
  const value = fields.elements.namedItem(name)
  if (!(value instanceof HTMLInputElement))
    throw new Error('Settings could not load.')
  return value
}
function select(name: string): HTMLSelectElement {
  const value = fields.elements.namedItem(name)
  if (!(value instanceof HTMLSelectElement))
    throw new Error('Settings could not load.')
  return value
}

function fill(settings: Settings): void {
  select('provider').value = settings.provider
  languageSettings.fill(settings)
  input('adaptToPage').checked = settings.adaptToPage
  input('azureKey').value = settings.azure.key
  input('azureRegion').value = settings.azure.region
  input('deeplKey').value = settings.deepl.key
  select('deeplEndpoint').value = settings.deepl.endpoint
  if (summary)
    summary.textContent = [
      settings.azure.key ? 'Azure ready' : '',
      settings.deepl.key ? 'DeepL ready' : '',
    ]
      .filter(Boolean)
      .join(' · ')
}
function read(): Settings {
  return parseSettings({
    ...languageSettings.read(),
    provider: select('provider').value,
    adaptToPage: input('adaptToPage').checked,
    azure: {
      key: input('azureKey').value,
      region: input('azureRegion').value.trim(),
    },
    deepl: {
      key: input('deeplKey').value,
      endpoint: select('deeplEndpoint').value,
    },
  })
}
select('provider').addEventListener('change', () => {
  const provider = select('provider').value
  if (isProvider(provider)) languageSettings.setProvider(provider)
})
async function call(request: unknown): Promise<unknown> {
  return unwrapResponse(await chrome.runtime.sendMessage(request))
}

void call({ kind: 'get-settings' })
  .then((value) => {
    const settings = parseSettings(value)
    fill(settings)
    details.open = !settings[settings.provider].key
  })
  .catch(() => {
    status.textContent = 'Settings could not load. Reload this tab.'
  })

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const result = parseSettings(
      await call({ kind: 'save-settings', value: read() })
    )
    fill(result)
    status.textContent = 'Saved. Your next translation will use these settings.'
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Settings could not be saved.'
  }
})
envFile.addEventListener('change', async () => {
  const file = envFile.files?.[0]
  if (!file) return
  try {
    if (file.size > 64_000)
      throw new Error("Choose the project's small .env file.")
    const imported = settingsFromEnv(parseEnvFile(await file.text()))
    fill({ ...read(), azure: imported.azure, deepl: imported.deepl })
    status.textContent = 'Keys imported. Save settings to use them.'
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'The file could not be imported.'
  }
  envFile.value = ''
})
