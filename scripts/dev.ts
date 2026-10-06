import { resolve } from 'node:path'
import { createSettingsStore } from '@/domain/settings/createSettingsStore'
import { settingsFromEnv, type Settings } from '@/domain/settings/settings'
import { createTranslationService } from '@/domain/translation/createTranslationService'
import {
  parseTranslationRequest,
  TranslationError,
} from '@/domain/translation/translation'
import { isRecord } from '@/utils/isRecord'

const root = resolve(import.meta.dir, '..')
const result = await Bun.build({
  entrypoints: [resolve(root, 'src/entries/demo.ts')],
  outdir: resolve(root, '.preview'),
  target: 'browser',
  format: 'iife',
  minify: false,
  env: 'disable',
})

if (!result.success) {
  throw new Error('The demo could not build.')
}

let persisted: Settings | undefined
const store = createSettingsStore({
  read: async () => persisted,
  write: async (settings) => {
    persisted = settings
  },
  seed: async () => settingsFromEnv(Bun.env),
})

const translator = createTranslationService({ readSettings: store.settings })

const styles = new Set([
  'editorial',
  'technical',
  'journal',
  'warm',
  'forest',
  'contrast',
  'neon',
  'gradient',
])

async function runApiRequest(value: Record<string, unknown>): Promise<unknown> {
  switch (value.kind) {
    case 'preferences':
      return store.preferences()
    case 'update-preferences':
      return store.updatePreferences(value.value)
    case 'translate':
      return translator.translate(parseTranslationRequest(value))
    case 'open-settings':
      return null
    default:
      throw new Error("Use the extension's settings page to manage keys.")
  }
}

async function handleApi(request: Request, url: URL): Promise<Response> {
  if (
    request.method !== 'POST' ||
    !request.headers.get('content-type')?.startsWith('application/json') ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    return new Response('Forbidden', { status: 403 })
  }

  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const raw = await request.text()
    if (raw.length > 65_000) {
      throw new Error('The selection is too large.')
    }

    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)) {
      throw new Error('Invalid request.')
    }

    const data = await runApiRequest(value)

    return Response.json(
      { ok: true, data },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return Response.json({
      ok: false,
      code: error instanceof TranslationError ? error.code : 'configuration',
      message:
        error instanceof Error
          ? error.message
          : 'Translation could not finish.',
    })
  }
}

const STATIC_FILES: Record<string, { path: string; type?: string }> = {
  '/demo.js': { path: '.preview/demo.js', type: 'application/javascript' },
  '/demo.css': { path: 'demo/demo.css' },
  '/playground.js': {
    path: 'demo/playground.js',
    type: 'application/javascript',
  },
}

const PAGES = new Set(['/', '/fixture', '/test-page.html'])

async function servePage(url: URL): Promise<Response> {
  const style = url.searchParams.get('style') ?? 'editorial'
  const template = await Bun.file(resolve(root, 'demo/test-page.html')).text()
  let html = template.replace(
    'data-style="editorial"',
    `data-style="${styles.has(style) ? style : 'editorial'}"`
  )

  // The fixture page leaves the popup to the installed extension.
  if (url.pathname === '/') {
    html = html.replace(
      '</body>',
      '<script src="/demo.js" defer></script></body>'
    )
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 5173,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/api') {
      return handleApi(request, url)
    }

    const file = STATIC_FILES[url.pathname]
    if (file) {
      return new Response(
        Bun.file(resolve(root, file.path)),
        file.type ? { headers: { 'Content-Type': file.type } } : undefined
      )
    }

    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 })
    }

    if (!PAGES.has(url.pathname)) {
      return new Response('Not found', { status: 404 })
    }

    return servePage(url)
  },
})

console.info(`Shvyd playground: http://localhost:${server.port}`)
console.info(
  `Installed extension test page: http://localhost:${server.port}/fixture`
)
console.info(
  'Keep this terminal running while you test. Press Ctrl+C to stop the playground.'
)
