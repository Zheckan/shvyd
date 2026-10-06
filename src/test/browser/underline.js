// Exercise selection capture and rendering through the public playground popup.
;(async () => {
  const root = document.getElementById('shvyd-root').shadowRoot
  const originalFetch = window.fetch
  const fixture = document.createElement('p')
  fixture.innerHTML =
    'Plain before <a href="https://example.com" style="text-decoration: underline" onclick="void 0"><strong>Underlined link</strong></a> plain after.'
  document.querySelector('article').append(fixture)
  let request
  window.fetch = async (input, init) => {
    if (input === '/api' && init?.body) {
      const value = JSON.parse(init.body)
      if (value.kind === 'translate') {
        request = value
        return Response.json({
          ok: true,
          data: {
            text: value.text,
            format: value.format,
            target: value.target,
            provider: value.provider,
            cached: false,
            durationMs: 0,
          },
        })
      }
    }

    return originalFetch.call(window, input, init)
  }

  const wait = async (condition) => {
    const deadline = performance.now() + 3000
    while (!condition()) {
      if (performance.now() > deadline) {
        throw new Error('Underline fixture did not finish translating')
      }

      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  try {
    root.querySelector('button[aria-label="Close translation"]').click()
    fixture.scrollIntoView({ block: 'center' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const range = document.createRange()
    range.selectNodeContents(fixture)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    await wait(() => !root.querySelector('.bubble').hidden)
    root.querySelector('.bubble').click()
    await wait(
      () => root.querySelector('.panel').getAttribute('aria-busy') === 'false'
    )

    const output = root.querySelector('.translation')
    const underlined = output.querySelector('u')
    if (
      underlined?.textContent !== 'Underlined link' ||
      !getComputedStyle(underlined).textDecorationLine.includes('underline')
    ) {
      throw new Error(
        'The translated link must remain underlined; surrounding plain text must not be underlined'
      )
    }

    if (!underlined.querySelector('strong')) {
      throw new Error('Underlining must preserve nested bold text')
    }

    if (
      output.querySelector('a,[href],[style],[onclick]') ||
      /href=|style=|onclick=/.test(request.text)
    ) {
      throw new Error(
        'Underlining must not copy source attributes or link destinations'
      )
    }

    return {
      passed: true,
      checks: [
        'css-underlined-link-keeps-underline-and-bold',
        'underline-preserves-source-attribute-sanitization',
      ],
    }
  } finally {
    window.fetch = originalFetch
    fixture.remove()
  }
})()
