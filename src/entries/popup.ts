import { mountQuickSettings } from '@/features/quick-settings/mountQuickSettings'

mountQuickSettings({
  send: (request) => chrome.runtime.sendMessage(request),
  askActiveTab: async (message) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const tabId = tab?.id

    if (tabId === undefined) {
      throw new Error('No active tab.')
    }

    return chrome.tabs.sendMessage(tabId, message)
  },
  openSettings: () => {
    void chrome.runtime.openOptionsPage()
    window.close()
  },
  version: chrome.runtime.getManifest().version,
})
