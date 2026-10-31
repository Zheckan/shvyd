import { parseDeepLUsage } from '@/domain/translation/checkDeepLUsage'
import { unwrapResponse } from '@/domain/translation/translation-client'
import {
  parseDiagnosticsExport,
  parseUsageView,
  type UsageView,
} from '@/domain/usage/usage'
import {
  formatDeepLUsage,
  formatTrackingSince,
  usageTable,
} from './logic/formatUsage'

const TABLE_COLUMNS = [
  'route',
  'requests',
  'characters',
  'reused',
  'failed',
  'uncertain',
] as const

export function mountUsageSettings(
  send: (request: unknown) => Promise<unknown>
): void {
  function required<T extends HTMLElement>(
    selector: string,
    constructor: { new (...args: never[]): T }
  ): T {
    const element = document.querySelector(selector)

    if (!(element instanceof constructor)) {
      throw new Error('Usage settings could not load.')
    }

    return element
  }

  const since = required('#usage-since', HTMLElement)
  const rows = required('#usage-rows', HTMLTableSectionElement)
  const empty = required('#usage-empty', HTMLElement)
  const clearUsage = required('#clear-usage', HTMLButtonElement)
  const usageStatus = required('#usage-status', HTMLOutputElement)
  const deeplStatus = required('#deepl-usage', HTMLOutputElement)
  const checkDeepL = required('#check-deepl-usage', HTMLButtonElement)
  const diagnosticsEnabled = required('#diagnostics-enabled', HTMLInputElement)
  const diagnosticsCount = required('#diagnostics-count', HTMLOutputElement)
  const previewButton = required('#preview-diagnostics', HTMLButtonElement)
  const downloadButton = required('#download-diagnostics', HTMLButtonElement)
  const clearDiagnostics = required('#clear-diagnostics', HTMLButtonElement)
  const preview = required('#diagnostics-preview', HTMLPreElement)
  const periodButtons = document.querySelectorAll<HTMLButtonElement>(
    '[data-usage-period]'
  )
  let view: UsageView | undefined
  let periodDays = 1

  async function call(request: unknown): Promise<unknown> {
    return unwrapResponse(await send(request))
  }

  function render(): void {
    if (!view) {
      return
    }

    since.textContent = formatTrackingSince(view)
    const table = usageTable(view, periodDays, new Date())
    rows.replaceChildren(
      ...table.rows.map((row) => {
        const element = document.createElement('tr')

        for (const column of TABLE_COLUMNS) {
          const cell = document.createElement(column === 'route' ? 'th' : 'td')
          cell.textContent = row[column]

          if (column === 'route') {
            cell.scope = 'row'
          }

          element.append(cell)
        }

        return element
      })
    )
    empty.hidden = !table.empty

    const { enabled, count } = view.diagnostics
    diagnosticsEnabled.checked = enabled
    diagnosticsCount.textContent = enabled
      ? `${count} ${count === 1 ? 'record' : 'records'} kept`
      : 'Not keeping error records'
    previewButton.disabled = count === 0
    downloadButton.disabled = count === 0
    clearDiagnostics.disabled = count === 0

    if (count === 0) {
      preview.hidden = true
      preview.textContent = ''
    }
  }

  async function refresh(request: unknown): Promise<void> {
    try {
      view = parseUsageView(await call(request))
      delete usageStatus.dataset.state
      usageStatus.textContent = ''
      render()
    } catch (error) {
      usageStatus.dataset.state = 'error'
      usageStatus.textContent =
        error instanceof Error ? error.message : 'Usage could not load.'
    }
  }

  async function exported(): Promise<string> {
    const data = parseDiagnosticsExport(
      await call({ kind: 'export-diagnostics' })
    )
    return JSON.stringify(data, null, 2)
  }

  for (const button of periodButtons) {
    button.addEventListener('click', () => {
      periodDays = Number(button.dataset.usagePeriod) || 1

      for (const other of periodButtons) {
        other.setAttribute('aria-pressed', String(other === button))
      }

      render()
    })
  }

  clearUsage.addEventListener('click', () => {
    if (
      window.confirm(
        'Clear usage counts on this browser? Error records are kept.'
      )
    ) {
      void refresh({ kind: 'clear-usage' })
    }
  })

  checkDeepL.addEventListener('click', async () => {
    checkDeepL.disabled = true
    deeplStatus.dataset.state = 'testing'
    deeplStatus.textContent = 'Checking…'

    try {
      const usage = parseDeepLUsage(await call({ kind: 'check-deepl-usage' }))
      deeplStatus.dataset.state = 'success'
      deeplStatus.textContent = formatDeepLUsage(usage)
    } catch (error) {
      deeplStatus.dataset.state = 'error'
      deeplStatus.textContent =
        error instanceof Error ? error.message : 'The check failed.'
    } finally {
      checkDeepL.disabled = false
    }
  })

  diagnosticsEnabled.addEventListener('change', () => {
    const enabled = diagnosticsEnabled.checked

    if (
      !enabled &&
      view?.diagnostics.count &&
      !window.confirm('Turn off error records and delete the kept records?')
    ) {
      diagnosticsEnabled.checked = true
      return
    }

    void refresh({ kind: 'set-diagnostics', enabled })
  })

  previewButton.addEventListener('click', async () => {
    if (!preview.hidden) {
      preview.hidden = true
      previewButton.textContent = 'Preview'
      return
    }

    try {
      preview.textContent = await exported()
      preview.hidden = false
      previewButton.textContent = 'Hide preview'
    } catch (error) {
      usageStatus.dataset.state = 'error'
      usageStatus.textContent =
        error instanceof Error ? error.message : 'Diagnostics could not load.'
    }
  })

  downloadButton.addEventListener('click', async () => {
    try {
      const url = URL.createObjectURL(
        new Blob([await exported()], { type: 'application/json' })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `shvyd-diagnostics-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      usageStatus.dataset.state = 'error'
      usageStatus.textContent =
        error instanceof Error ? error.message : 'Diagnostics could not export.'
    }
  })

  clearDiagnostics.addEventListener('click', () => {
    previewButton.textContent = 'Preview'
    void refresh({ kind: 'clear-diagnostics' })
  })

  // Counts change while other tabs translate; refresh when this tab is shown again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void refresh({ kind: 'get-usage' })
    }
  })

  void refresh({ kind: 'get-usage' })
}
