import { mountSettingsPage } from '@/features/settings-page/mountSettingsPage'

mountSettingsPage((request) => chrome.runtime.sendMessage(request))
