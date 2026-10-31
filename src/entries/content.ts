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

mountTranslator(client, {
  site: siteFromOrigins(location.origin, [...location.ancestorOrigins]),
})
