import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { extensionId } from './extensionId'

const root = resolve(import.meta.dir, '../..')

test('the manifest key gives Shvyd its fixed ID', async () => {
  const manifest = await Bun.file(
    resolve(root, 'extension/manifest.json')
  ).json()

  expect(extensionId(manifest.key)).toBe('fccglnmggflkkamnjjkibkbbakdkhgil')
})

test('the relay accepts requests from that ID', async () => {
  const manifest = await Bun.file(
    resolve(root, 'extension/manifest.json')
  ).json()
  const relay = await Bun.file(resolve(root, 'wrangler.jsonc')).text()

  expect(relay).toContain(`chrome-extension://${extensionId(manifest.key)}`)
})
