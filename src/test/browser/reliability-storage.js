;(() => {
  const originalSet = chrome.storage.local.set.bind(chrome.storage.local)
  const state = {
    holdSaves: false,
    saves: [],
  }
  globalThis.shvydProbe = state

  chrome.storage.local.set = (value) => {
    if (!state.holdSaves) {
      return originalSet(value)
    }
    return new Promise((resolve, reject) => {
      state.saves.push({
        async resolve() {
          await originalSet(value)
          resolve()
        },
        reject() {
          reject(new Error('Controlled storage failure'))
        },
      })
    })
  }
  return true
})()
