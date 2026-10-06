// Run in the live playground with controlled translation responses and preferences.
// scripts/check-demo.py also runs this public UI regression.
;(async () => {
  const root = document.getElementById('shvyd-root').shadowRoot
  const panel = root.querySelector('.panel')
  const menu = root.querySelector('.language-menu')
  const originalFetch = window.fetch
  const checks = []
  const bounds = (element) => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x, y, width, height }
  }

  const wait = async (condition, description) => {
    const deadline = performance.now() + 3000
    while (!condition()) {
      if (performance.now() > deadline) {
        throw new Error(`Popup did not become ready: ${description}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  const assertStable = (before, action) => {
    const after = bounds(panel)
    if (
      Object.keys(before).some((key) => Math.abs(before[key] - after[key]) > 1)
    ) {
      throw new Error(
        `${action} moved or resized the translation: ${JSON.stringify({ before, after })}`
      )
    }
  }

  const assertAnchored = () => {
    const box = menu.getBoundingClientRect()
    const anchor = root.querySelector('.target').getBoundingClientRect()
    const gap = Math.min(
      Math.abs(box.top - anchor.bottom),
      Math.abs(anchor.top - box.bottom)
    )

    if (
      box.left < 11 ||
      box.top < 11 ||
      box.right > innerWidth - 11 ||
      box.bottom > innerHeight - 11 ||
      Math.abs(gap - 6) > 1
    ) {
      throw new Error(
        'The language popover must stay anchored within the viewport'
      )
    }
  }

  window.fetch = async (input, init) => {
    if (input === '/api' && init?.body) {
      const request = JSON.parse(init.body)
      if (request.kind === 'preferences') {
        const response = await originalFetch.call(window, input, init)
        const value = await response.json()
        return Response.json({
          ...value,
          data: {
            ...value.data,
            favoriteLanguages: ['uk', 'en', 'pl'],
            targetMode: 'fixed',
            target: 'uk',
            showOtherLanguages: true,
          },
        })
      }

      if (request.kind === 'translate') {
        return Response.json({
          ok: true,
          data: {
            text: 'A short translated passage.',
            format: 'plain',
            target: request.target,
            provider: request.provider,
            cached: false,
            durationMs: 0,
          },
        })
      }
    }

    return originalFetch.call(window, input, init)
  }

  try {
    root.querySelector('button[aria-label="Close translation"]').click()
    const passage = document.getElementById('short-text')
    passage.scrollIntoView({ block: 'center' })
    // Page scrolling dismisses a popup. Wait before creating the new selection.
    await new Promise((resolve) => setTimeout(resolve, 100))
    const range = document.createRange()
    range.selectNodeContents(passage)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    await wait(() => !root.querySelector('.bubble').hidden, 'selection button')
    root.querySelector('.bubble').click()
    await wait(
      () => !panel.hidden && panel.getAttribute('aria-busy') === 'false',
      'translation'
    )

    const before = bounds(panel)
    root.querySelector('.target').click()
    assertStable(before, 'Opening preferred languages')
    assertAnchored()
    checks.push('preferred-menu-keeps-panel-stable')
    root.querySelector('.more-languages').click()
    assertStable(before, 'Opening additional languages')
    if (menu.hidden) {
      throw new Error('Language choices must be visible')
    }

    assertAnchored()
    checks.push('additional-menu-keeps-panel-stable')
    const search = root.querySelector('.language-search')
    search.value = 'Chinese'
    search.dispatchEvent(new Event('input'))
    if (!menu.querySelector('[data-language="zh-hant"]')) {
      throw new Error('Language search must find Traditional Chinese')
    }

    assertStable(before, 'Searching languages')
    assertAnchored()
    checks.push('language-search-keeps-panel-stable')
    search.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        composed: true,
      })
    )

    if (root.activeElement?.getAttribute('role') !== 'option') {
      throw new Error('ArrowDown must focus a language')
    }

    root.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'End',
        bubbles: true,
        composed: true,
      })
    )

    if (root.activeElement?.dataset.language !== 'zh-hant') {
      throw new Error('End must focus the last matching language')
    }

    checks.push('language-menu-keyboard-navigation')
    root.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
      })
    )

    if (
      !menu.hidden ||
      panel.hidden ||
      root.activeElement !== root.querySelector('.target')
    ) {
      throw new Error('Escape must close only the menu and restore focus')
    }

    assertStable(before, 'Closing languages with Escape')
    checks.push('escape-closes-only-language-menu')
    root.querySelector('.target').click()
    root
      .querySelector('.translation')
      .dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, composed: true })
      )
    if (!menu.hidden || panel.hidden) {
      throw new Error(
        'Clicking the translation must dismiss only the language menu'
      )
    }

    assertStable(before, 'Clicking outside the language menu')
    checks.push('translation-click-closes-only-language-menu')
    root.querySelector('.target').click()
    menu.querySelector('[data-language="en"]').click()
    await wait(
      () =>
        panel.getAttribute('aria-busy') === 'false' &&
        root.querySelector('.translation').lang === 'en',
      'new target'
    )

    if (!menu.hidden) {
      throw new Error('Choosing a language must close the language menu')
    }

    checks.push('choosing-language-translates-and-closes-menu')
    root.querySelector('.target').click()
    root.querySelector('.more-languages').click()
    assertAnchored()
    return {
      passed: true,
      checks,
    }
  } finally {
    window.fetch = originalFetch
  }
})()
