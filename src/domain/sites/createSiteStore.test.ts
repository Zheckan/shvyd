import { describe, expect, test } from 'bun:test'
import { createSiteStore, MAX_HIDDEN_SITES } from './createSiteStore'

function harness() {
  let stored: unknown

  return {
    open: () =>
      createSiteStore({
        read: async () => structuredClone(stored),
        write: async (value) => {
          stored = structuredClone(value)
        },
      }),
    setStored: (value: unknown) => {
      stored = value
    },
  }
}

describe('hidden sites', () => {
  test('hiding and showing a site survives a worker restart', async () => {
    const setup = harness()
    const first = setup.open()

    await first.hide('example.com')
    await first.hide('docs.example.org')
    await first.hide('example.com')

    const restarted = setup.open()
    expect(await restarted.isHidden('example.com')).toBe(true)
    expect(await restarted.list()).toEqual(['docs.example.org', 'example.com'])

    await restarted.show('example.com')
    expect(await restarted.isHidden('example.com')).toBe(false)
    expect(await restarted.list()).toEqual(['docs.example.org'])
  })

  test('the list keeps the most recently hidden sites within its limit', async () => {
    const store = harness().open()

    for (let index = 0; index <= MAX_HIDDEN_SITES; index++) {
      await store.hide(`site${index}.example`)
    }

    const sites = await store.list()
    expect(sites).toHaveLength(MAX_HIDDEN_SITES)
    expect(sites).not.toContain('site0.example')
    expect(await store.isHidden(`site${MAX_HIDDEN_SITES}.example`)).toBe(true)
  })

  test('unreadable stored data shows Shvyd everywhere instead of failing', async () => {
    const setup = harness()
    setup.setStored({ version: 1, hidden: ['ok.example', 'not a host'] })

    expect(await setup.open().list()).toEqual([])
  })

  test('invalid site names are rejected', async () => {
    await expect(harness().open().hide('bad host')).rejects.toThrow()
  })
})
