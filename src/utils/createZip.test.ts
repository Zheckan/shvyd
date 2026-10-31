import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createZip } from './createZip'

test('a standard unzip tool extracts every entry intact, and identical input gives identical bytes', async () => {
  const encoder = new TextEncoder()
  const entries = [
    { path: 'manifest.json', data: encoder.encode('{"name":"Ш"}') },
    { path: 'icons/icon16.png', data: new Uint8Array([0, 1, 2, 255]) },
    { path: 'empty.txt', data: new Uint8Array() },
  ]
  const archive = createZip(entries)
  expect(createZip(entries)).toEqual(archive)

  const directory = await mkdtemp(resolve(tmpdir(), 'zip-test-'))

  try {
    const path = resolve(directory, 'test.zip')
    await Bun.write(path, archive)
    const check = Bun.spawnSync(['unzip', '-tq', path])
    expect(check.exitCode).toBe(0)
    const list = Bun.spawnSync(['unzip', '-Z1', path]).stdout.toString()
    expect(list.trim().split('\n')).toEqual(entries.map((entry) => entry.path))
    const content = Bun.spawnSync(['unzip', '-p', path, 'manifest.json'])
    expect(content.stdout.toString()).toBe('{"name":"Ш"}')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
