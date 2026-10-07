import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')

test('both extension artifacts omit owner credentials and remove a legacy bootstrap on rebuild', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'shvyd-release-'))
  const sentinels = ['owner-azure-build-sentinel', 'owner-deepl-build-sentinel']

  try {
    for (const local of [false, true]) {
      await Bun.write(
        resolve(output, 'local-settings.json'),
        JSON.stringify({ key: sentinels[0] })
      )
      const process = Bun.spawn(
        [
          'bun',
          '-e',
          `import { build } from './scripts/build.ts'; await build(${local}, Bun.argv[1])`,
          output,
        ],
        {
          cwd: root,
          env: {
            ...Bun.env,
            AZURE_TRANSLATOR_KEY: sentinels[0],
            DEEPL_API_KEY: sentinels[1],
            SHVYD_AZURE_PROXY_URL: 'https://relay.example.com/translate',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        }
      )
      const code = await process.exited
      expect(code).toBe(0)
      expect(
        await Bun.file(resolve(output, 'local-settings.json')).exists()
      ).toBe(false)
      const paths: string[] = []
      for await (const path of new Bun.Glob('**/*').scan({
        cwd: output,
        onlyFiles: true,
      })) {
        paths.push(path)
      }
      expect(paths).toContain('background.js')
      for (const path of paths) {
        const contents = await Bun.file(resolve(output, path)).text()
        for (const sentinel of sentinels) {
          expect(contents).not.toContain(sentinel)
        }
      }
      expect(
        await Bun.file(resolve(output, 'release-config.json')).json()
      ).toEqual({ managedAzureUrl: 'https://relay.example.com/translate' })
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 15_000)
