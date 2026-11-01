import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

type Version = [major: number, minor: number, patch: number]

function parse(value: string): Version | undefined {
  const match = SEMVER.exec(value)

  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined
}

/**
 * The owner sets major and minor in the source. Each merge to main releases
 * the next patch in that line: the source version itself if that line has no
 * release yet, otherwise one more than the highest released patch.
 */
export function nextReleaseVersion(source: string, tags: string[]): string {
  const base = parse(source)

  if (!base) {
    throw new Error(`Version ${source} must look like MAJOR.MINOR.PATCH.`)
  }

  const [major, minor, patch] = base
  const released = tags
    .map((tag) => parse(tag.replace(/^v/, '')))
    .filter(
      (version): version is Version =>
        version?.[0] === major && version[1] === minor
    )
    .map((version) => version[2])

  const next =
    released.length === 0 ? patch : Math.max(patch, Math.max(...released) + 1)

  return `${major}.${minor}.${next}`
}

async function writeVersion(path: string, version: string): Promise<void> {
  const file = Bun.file(path)
  const json = (await file.json()) as Record<string, unknown>

  await Bun.write(path, JSON.stringify({ ...json, version }, null, 2) + '\n')
}

if (import.meta.main) {
  const tags = (await Bun.$`git tag --list 'v*'`.cwd(root).text())
    .split('\n')
    .filter(Boolean)
  const source = (
    (await Bun.file(resolve(root, 'package.json')).json()) as {
      version: string
    }
  ).version
  const version = nextReleaseVersion(source, tags)

  // Stamps the version into this checkout only; the workflow never commits it.
  await writeVersion(resolve(root, 'package.json'), version)
  await writeVersion(resolve(root, 'extension/manifest.json'), version)
  console.info(version)
}
