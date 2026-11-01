// Line breaks drawn from newline characters (YouTube descriptions) survive translation.
;(async () => {
  const root = document.getElementById('shvyd-root').shadowRoot
  const originalFetch = window.fetch
  const fixture = document.createElement('div')
  const description = document.createElement('span')
  description.style.whiteSpace = 'pre-wrap'
  description.textContent =
    'Cars That Are Now Half Price\n\nThomas and James take to the couch.\nSUBSCRIBE!\n\nThanks to the sponsor.'
  const code = document.createElement('pre')
  code.textContent = 'line one\nline two'
  fixture.append(description, code)
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
        throw new Error('Line-break fixture did not finish translating')
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
    const lines = output.innerText.split('\n')
    const expected = [
      'Cars That Are Now Half Price',
      '',
      'Thomas and James take to the couch.',
      'SUBSCRIBE!',
      '',
      'Thanks to the sponsor.',
    ]

    if (expected.some((line, index) => lines[index] !== line)) {
      throw new Error(
        `Newline-separated lines must stay separate, got ${JSON.stringify(lines)} from ${request.text}`
      )
    }

    if (output.querySelector('pre')?.textContent !== 'line one\nline two') {
      throw new Error('Preformatted text must keep its own newlines')
    }

    return {
      passed: true,
      checks: [
        'newline-separated-lines-and-blank-lines-survive-translation',
        'preformatted-text-keeps-its-newlines',
      ],
    }
  } finally {
    window.fetch = originalFetch
    fixture.remove()
  }
})()
