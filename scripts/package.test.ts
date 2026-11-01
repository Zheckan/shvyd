import { expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { DEFAULT_MANAGED_AZURE_URL } from '@/config/release'
import {
  assertVersionsMatch,
  packageExtension,
  RELEASE_FILES,
  secretValues,
} from './package'

test('the release ZIP holds exactly the allowlisted files, is reproducible, and records its checksum', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'shvyd-package-test-'))

  try {
    const first = await packageExtension({
      outputDirectory: output,
      secrets: [],
    })
    const firstBytes = await Bun.file(first.zipPath).bytes()
    const second = await packageExtension({
      outputDirectory: output,
      secrets: [],
    })

    expect(second.sha256).toBe(first.sha256)
    expect(await Bun.file(second.zipPath).bytes()).toEqual(firstBytes)
    expect(first.zipPath.endsWith(`shvyd-${first.version}.zip`)).toBe(true)

    const list = Bun.spawnSync([
      'unzip',
      '-Z1',
      first.zipPath,
    ]).stdout.toString()
    expect(list.trim().split('\n')).toEqual([...RELEASE_FILES])
    expect(await Bun.file(`${first.zipPath}.sha256`).text()).toBe(
      `${first.sha256}  shvyd-${first.version}.zip\n`
    )
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

test('packaging refuses to write a release containing a configured credential', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'shvyd-package-test-'))

  try {
    // The public relay host is always present, so it stands in for a leaked value.
    await expect(
      packageExtension({ outputDirectory: output, secrets: ['workers.dev'] })
    ).rejects.toThrow('contains a configured credential')
    expect(await readdir(output)).toEqual([])
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

test('only credential-like variables with real values are scanned for', () => {
  expect(
    secretValues({
      AZURE_TRANSLATOR_KEY: 'azure-secret-value',
      CLOUDFLARE_WORKERS_API_TOKEN: 'token-value-1234',
      DEEPL_API_KEY: '',
      SHORT_KEY: 'abc',
      SHVYD_AZURE_PROXY_URL: 'https://relay.example',
    })
  ).toEqual(['azure-secret-value', 'token-value-1234'])
})

test('mismatched or invalid versions stop packaging', () => {
  expect(assertVersionsMatch('1.0.0', '1.0.0')).toBe('1.0.0')
  expect(() => assertVersionsMatch('1.0.0', '0.1.0')).toThrow('must match')
  expect(() => assertVersionsMatch('1.0.0-beta', '1.0.0-beta')).toThrow(
    'not a valid'
  )
})

test('the release uses the default relay even when the environment overrides it', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'shvyd-package-test-'))
  const previous = Bun.env.SHVYD_AZURE_PROXY_URL
  Bun.env.SHVYD_AZURE_PROXY_URL = 'https://dev-relay.example.com/translate'

  try {
    const result = await packageExtension({
      outputDirectory: output,
      secrets: [],
    })
    const config = Bun.spawnSync([
      'unzip',
      '-p',
      result.zipPath,
      'release-config.json',
    ]).stdout.toString()

    expect(JSON.parse(config)).toEqual({
      managedAzureUrl: DEFAULT_MANAGED_AZURE_URL,
    })
  } finally {
    if (previous === undefined) {
      delete Bun.env.SHVYD_AZURE_PROXY_URL
    } else {
      Bun.env.SHVYD_AZURE_PROXY_URL = previous
    }

    await rm(output, { recursive: true, force: true })
  }
}, 30_000)

test('the store ZIP leaves out the manifest key and keeps everything else', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'shvyd-package-test-'))
  const manifestIn = (zipPath: string) =>
    JSON.parse(
      Bun.spawnSync(['unzip', '-p', zipPath, 'manifest.json']).stdout.toString()
    )

  try {
    const trial = await packageExtension({
      outputDirectory: output,
      secrets: [],
    })
    const store = await packageExtension({
      outputDirectory: output,
      secrets: [],
      store: true,
    })
    const { key, ...rest } = manifestIn(trial.zipPath)

    expect(store.zipPath.endsWith(`shvyd-${store.version}-store.zip`)).toBe(
      true
    )
    expect(key).toBeString()
    expect(manifestIn(store.zipPath)).toEqual(rest)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)
