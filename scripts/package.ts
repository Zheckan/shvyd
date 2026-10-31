import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'
import { DEFAULT_MANAGED_AZURE_URL } from '@/config/release'
import { createZip } from '@/utils/createZip'
import { parseEnvFile } from '@/utils/parseEnvFile'
import { build } from './build'

const root = resolve(import.meta.dir, '..')

/** The only files a release may contain. Anything else in a build is left out. */
export const RELEASE_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'options.js',
  'options.html',
  'options.css',
  'language-settings.css',
  'usage.css',
  'preview.css',
  'release-config.json',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
] as const

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD)$/i
const MIN_SECRET_LENGTH = 8

/** Values of credential-like variables, so a release can be checked against them. */
export function secretValues(
  env: Record<string, string | undefined>
): string[] {
  return Object.entries(env)
    .filter(([name, value]) => SECRET_NAME.test(name) && value)
    .map(([, value]) => String(value).trim())
    .filter((value) => value.length >= MIN_SECRET_LENGTH)
}

export function assertVersionsMatch(
  packageVersion: unknown,
  manifestVersion: unknown
): string {
  if (
    typeof packageVersion !== 'string' ||
    packageVersion !== manifestVersion
  ) {
    throw new Error(
      `package.json version (${String(packageVersion)}) and extension/manifest.json version (${String(manifestVersion)}) must match.`
    )
  }

  if (!/^\d+(\.\d+){0,3}$/.test(packageVersion)) {
    throw new Error(
      `Version ${packageVersion} is not a valid Chrome extension version.`
    )
  }

  return packageVersion
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, resolve(entry.parentPath, entry.name)))
    .sort()
}

function sha256(data: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(data).digest('hex')
}

export async function packageExtension({
  outputDirectory = resolve(root, 'release'),
  secrets,
  managedAzureUrl = DEFAULT_MANAGED_AZURE_URL,
}: {
  outputDirectory?: string
  secrets: string[]
  /** Passed explicitly so a local `.env` override can never reach a release. */
  managedAzureUrl?: string
}): Promise<{
  zipPath: string
  sha256: string
  version: string
  managedAzureUrl: string
  omitted: string[]
}> {
  const packageJson = await Bun.file(resolve(root, 'package.json')).json()
  const manifest = await Bun.file(
    resolve(root, 'extension/manifest.json')
  ).json()
  const version = assertVersionsMatch(packageJson.version, manifest.version)

  // A fresh directory keeps stale development files in dist/ out of the release.
  const staging = await mkdtemp(resolve(tmpdir(), 'shvyd-package-'))

  try {
    await build(false, staging, managedAzureUrl)
    const built = await listFiles(staging)
    const missing = RELEASE_FILES.filter((path) => !built.includes(path))

    if (missing.length > 0) {
      throw new Error(
        `The build is missing release files: ${missing.join(', ')}`
      )
    }

    const entries = await Promise.all(
      RELEASE_FILES.map(async (path) => ({
        path,
        data: new Uint8Array(
          await Bun.file(resolve(staging, path)).arrayBuffer()
        ),
      }))
    )

    const decoder = new TextDecoder()

    for (const entry of entries) {
      const text = decoder.decode(entry.data)

      if (secrets.some((secret) => text.includes(secret))) {
        throw new Error(
          `${entry.path} contains a configured credential. Nothing was packaged.`
        )
      }
    }

    const builtManifest = JSON.parse(decoder.decode(entries[0]?.data))

    if (builtManifest.version !== version) {
      throw new Error('The built manifest version does not match package.json.')
    }

    const archive = createZip(entries)
    const hash = sha256(archive)
    const name = `shvyd-${version}.zip`
    const zipPath = resolve(outputDirectory, name)

    await mkdir(outputDirectory, { recursive: true })
    await Bun.write(zipPath, archive)
    await Bun.write(`${zipPath}.sha256`, `${hash}  ${name}\n`)

    return {
      zipPath,
      sha256: hash,
      version,
      managedAzureUrl,
      omitted: built.filter(
        (path) => !RELEASE_FILES.some((file) => file === path)
      ),
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const envFile = Bun.file(resolve(root, '.env'))
  const fileValues = (await envFile.exists())
    ? parseEnvFile(await envFile.text())
    : {}
  const relayFlag = Bun.argv.find((value) => value.startsWith('--relay='))
  const result = await packageExtension({
    secrets: secretValues({ ...fileValues, ...Bun.env }),
    managedAzureUrl: relayFlag?.slice('--relay='.length),
  })

  console.info(
    `Packaged ${relative(root, result.zipPath)} (version ${result.version})`
  )
  console.info(`SHA-256 ${result.sha256}`)
  console.info(`Included Azure relay: ${result.managedAzureUrl || 'disabled'}`)

  if (result.omitted.length > 0) {
    console.info(`Left out of the release: ${result.omitted.join(', ')}`)
  }
}
