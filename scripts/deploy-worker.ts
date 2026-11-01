import { chmod } from 'node:fs/promises'
import { isRecord } from '@/utils/isRecord'
import { build } from './build'

const account = Bun.env.CLOUDFLARE_ACCOUNT_ID
const token = Bun.env.CLOUDFLARE_WORKERS_API_TOKEN
const azureKey = Bun.env.AZURE_TRANSLATOR_KEY

if (!account || !token || !azureKey) {
  throw new Error(
    'Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WORKERS_API_TOKEN, and AZURE_TRANSLATOR_KEY in .env. Values are never printed.'
  )
}

const environment = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: account,
  CLOUDFLARE_API_TOKEN: token,
  WRANGLER_SEND_METRICS: 'false',
  CI: 'true',
}

async function wrangler(args: string[], secret?: string): Promise<void> {
  const process = Bun.spawn(['bunx', 'wrangler@4.148.0', ...args], {
    env: environment,
    stdin: secret ? 'pipe' : 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  })

  if (secret && process.stdin) {
    process.stdin.write(secret + '\n')
    process.stdin.end()
  }

  if ((await process.exited) !== 0) {
    throw new Error(
      'Worker setup failed. The release endpoint was not changed.'
    )
  }
}

await wrangler(['deploy'])
await wrangler(['secret', 'put', 'AZURE_TRANSLATOR_KEY'], azureKey)

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`,
  { headers: { Authorization: `Bearer ${token}` } }
)
const data: unknown = await response.json()

if (
  !response.ok ||
  !isRecord(data) ||
  data.success !== true ||
  !isRecord(data.result) ||
  typeof data.result.subdomain !== 'string' ||
  !/^[a-z0-9-]+$/.test(data.result.subdomain)
) {
  throw new Error(
    'Worker deployed, but its public subdomain could not be read.'
  )
}

const endpoint = `https://shvyd-azure-relay.${data.result.subdomain}.workers.dev/translate`
const envPath = new URL('../.env', import.meta.url)
const values = (await Bun.file(envPath).text())
  .split('\n')
  .filter((line) => !/^(?:export\s+)?SHVYD_AZURE_PROXY_URL=/.test(line))

values.push(`SHVYD_AZURE_PROXY_URL=${endpoint}`)
await Bun.write(envPath, values.join('\n') + '\n')
await chmod(envPath, 0o600)
Bun.env.SHVYD_AZURE_PROXY_URL = endpoint
await build()
console.info(`Shared Azure endpoint: ${endpoint}`)
console.info('Credential-free dist/ rebuilt. Reload the installed extension.')
