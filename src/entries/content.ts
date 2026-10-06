import { createClient } from '@/domain/translation/translation-client'
import { mountTranslator } from '@/features/translator/mountTranslator'

mountTranslator(createClient((request) => chrome.runtime.sendMessage(request)))
