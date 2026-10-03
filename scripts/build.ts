import { chmod, mkdir, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DEFAULT_SETTINGS, settingsFromEnv } from '../src/settings'

export async function build(local = false): Promise<void> {
  const root = resolve(import.meta.dir, '..')
  const output = resolve(root, 'dist')
  await mkdir(output, { recursive: true })
  const result = await Bun.build({
    entrypoints: ['src/content.ts', 'src/background.ts', 'src/options.ts'].map(
      (path) => resolve(root, path)
    ),
    outdir: output,
    target: 'browser',
    format: 'iife',
    minify: true,
    env: 'disable',
  })
  if (!result.success)
    throw new Error(result.logs.map((log) => log.message).join('\n'))
  for (const name of ['manifest.json', 'options.html', 'options.css']) {
    await copyFile(resolve(root, 'extension', name), resolve(output, name))
  }
  const settings = local
    ? settingsFromEnv(Bun.env)
    : structuredClone(DEFAULT_SETTINGS)
  const path = resolve(output, 'local-settings.json')
  await Bun.write(path, JSON.stringify(settings))
  await chmod(path, 0o600)
  const sizes = await Promise.all(
    ['content.js', 'background.js', 'options.js'].map(async (name) => ({
      name,
      bytes: Bun.file(resolve(output, name)).size,
    }))
  )
  console.info(
    `Built dist/ ${local ? 'with private local Azure/DeepL settings' : 'without credentials'}.`
  )
  for (const item of sizes)
    console.info(`${item.name}: ${(item.bytes / 1024).toFixed(1)} KiB`)
}
if (import.meta.main) await build(Bun.argv.includes('--local'))
