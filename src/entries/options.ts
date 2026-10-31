import { mountSettingsPage } from '@/features/settings-page/mountSettingsPage'
import { mountUsageSettings } from '@/features/usage-settings/mountUsageSettings'

const send = (request: unknown) => chrome.runtime.sendMessage(request)

mountSettingsPage(send)
mountUsageSettings(send)
