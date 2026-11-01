import { parseSiteList } from '@/domain/sites/sites'
import { unwrapResponse } from '@/domain/translation/translation-client'
import { requireIn } from '@/utils/requireIn'

/** The settings card listing sites where Shvyd is turned off. */
export function mountSiteSettings(
  send: (request: unknown) => Promise<unknown>
): void {
  const required = requireIn(document)
  const list = required('#hidden-site-list', HTMLUListElement)
  const empty = required('#hidden-sites-empty', HTMLElement)
  const status = required('#hidden-sites-status', HTMLOutputElement)

  async function call(request: unknown): Promise<string[]> {
    return parseSiteList(await unwrapResponse(await send(request)))
  }

  function render(sites: string[]): void {
    list.replaceChildren(
      ...sites.map((site) => {
        const item = document.createElement('li')
        const name = document.createElement('span')
        const button = document.createElement('button')

        name.textContent = site
        button.type = 'button'
        button.className = 'button'
        button.textContent = 'Show again'
        button.setAttribute('aria-label', `Show Shvyd again on ${site}`)
        button.addEventListener('click', () => {
          void refresh({ kind: 'show-site', site }, `Shvyd is back on ${site}.`)
        })
        item.append(name, button)

        return item
      })
    )
    list.hidden = sites.length === 0
    empty.hidden = sites.length > 0
  }

  async function refresh(request: unknown, done = ''): Promise<void> {
    try {
      render(await call(request))
      delete status.dataset.state
      status.textContent = done
    } catch (error) {
      status.dataset.state = 'error'
      status.textContent =
        error instanceof Error ? error.message : 'Hidden sites could not load.'
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void refresh({ kind: 'hidden-sites' })
    }
  })

  void refresh({ kind: 'hidden-sites' })
}
