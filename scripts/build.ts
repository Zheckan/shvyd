import { mkdir, copyFile, cp, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { DEFAULT_MANAGED_AZURE_URL } from '@/config/release'
import { parseReleaseConfig } from '@/domain/settings/release-config'

export async function build(
  local = false,
  outputDirectory?: string,
  managedAzureUrl: string = Bun.env.SHVYD_AZURE_PROXY_URL ??
    DEFAULT_MANAGED_AZURE_URL
): Promise<void> {
  const root = resolve(import.meta.dir, '..')
  const output = outputDirectory ?? resolve(root, 'dist')
  await mkdir(output, { recursive: true })
  const config = parseReleaseConfig({ managedAzureUrl })

  const result = await Bun.build({
    entrypoints: ['content.ts', 'background.ts', 'options.ts', 'popup.ts'].map(
      (name) => resolve(root, 'src/entries', name)
    ),
    outdir: output,
    target: 'browser',
    format: 'iife',
    minify: true,
    env: 'disable',
  })

  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'))
  }

  for (const name of [
    'manifest.json',
    'options.html',
    'options.css',
    'language-settings.css',
    'usage.css',
    'preview.css',
    'popup.html',
    'popup.css',
  ]) {
    await copyFile(resolve(root, 'extension', name), resolve(output, name))
  }

  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES']) {
    await copyFile(resolve(root, name), resolve(output, name))
  }

  await cp(resolve(root, 'extension/icons'), resolve(output, 'icons'), {
    recursive: true,
  })

  // Remove the old credential-bearing bootstrap even when rebuilding an existing dist/.
  await rm(resolve(output, 'local-settings.json'), { force: true })
  await Bun.write(
    resolve(output, 'release-config.json'),
    JSON.stringify(config)
  )

  if (config.managedAzureUrl) {
    const path = resolve(output, 'manifest.json')
    const manifest = JSON.parse(await Bun.file(path).text())
    manifest.host_permissions.push(
      `${new URL(config.managedAzureUrl).origin}/*`
    )
    await Bun.write(path, JSON.stringify(manifest, null, 2))
  }

  const sizes = await Promise.all(
    ['content.js', 'background.js', 'options.js'].map(async (name) => ({
      name,
      bytes: Bun.file(resolve(output, name)).size,
    }))
  )

  console.info(
    `Built ${output.startsWith(root) ? relative(root, output) : 'a staging directory'} without provider credentials.${local ? ' build:local no longer embeds .env keys.' : ''}`
  )

  for (const item of sizes) {
    console.info(`${item.name}: ${(item.bytes / 1024).toFixed(1)} KiB`)
  }
}

if (import.meta.main) {
  await build(Bun.argv.includes('--local'))
}
