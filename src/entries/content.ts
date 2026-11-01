import { isRecord } from '@/utils/isRecord'
import { siteFromOrigins } from '@/domain/sites/sites'
import { createClient } from '@/domain/translation/translation-client'
import { mountTranslator } from '@/features/translator/mountTranslator'

const client = createClient(
  (request) => chrome.runtime.sendMessage(request),
  (listener) => {
    chrome.runtime.onMessage.addListener((message: unknown) => {
      listener(message)
    })
  }
)

const site = siteFromOrigins(location.origin, [...location.ancestorOrigins])

const unmount = mountTranslator(client, { site })

// After Shvyd is removed, reloaded, or updated, this copy of the script stays
// in open tabs but can no longer reach the extension. Leave the page instead
// of offering a Translate button that can only fail.
document.addEventListener('selectionchange', function leaveIfOrphaned() {
  if (!chrome.runtime?.id) {
    document.removeEventListener('selectionchange', leaveIfOrphaned)
    unmount()
  }
})

// The toolbar menu asks which site the active tab shows; only the page answers.
chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (
    window === window.top &&
    isRecord(message) &&
    message.kind === 'get-site'
  ) {
    respond({ site: site ?? null })
  }
})
