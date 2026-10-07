# Shared Azure access and BYOK

The owner's Azure key belongs on a server. An extension service worker is still part of the distributed client; embedding the key there lets recipients extract it. Masking a settings field does not protect a bundled key.

Both extension build commands now omit provider credentials and remove the old `dist/local-settings.json`. The only release configuration is `SHVYD_AZURE_PROXY_URL`, a public HTTPS endpoint ending in `/translate`. With no endpoint, Azure requires BYOK. The relay below is prepared but has not been deployed.

## Request routing

| Setting                 | Route                               |
| ----------------------- | ----------------------------------- |
| Azure, empty user key   | Shared relay, if configured         |
| Azure, user key present | Direct Azure request using that key |
| DeepL, empty user key   | Disabled; Azure stays selected      |
| DeepL, user key present | Direct DeepL request using that key |

Removing an Azure BYOK key restores shared access. Rejected BYOK does not silently use the owner's allowance. Removing a selected DeepL key switches the provider to Azure. Connection tests follow the same routes.

The options page receives only user-supplied keys and a boolean indicating whether shared Azure is configured. The content script receives neither user nor owner keys. Explicit `.env` import is a BYOK action, never an automatic release bootstrap.

## Existing installations

The old bootstrap and user keys were stored in the same record without provenance. The first upgrade clears those credentials once and preserves language and appearance preferences. Users must reenter their own keys. New user saves carry a `credentialOrigin: byok` marker, so later restarts retain them.

Reload the extension at `chrome://extensions` after building. That starts the new worker and migration. An already running old worker remains old code until the extension is reloaded.

## Cloudflare Worker deployment

`wrangler.jsonc` and `src/entries/azure-relay.ts` prepare the Worker. Cloudflare Worker hosting is selected. Deployment was attempted but Cloudflare rejected the existing token with HTTP 403 for Worker secrets and subdomain access. No Worker or Azure secret was uploaded. A dedicated deployment token is required.

1. Create a custom token at [Cloudflare API tokens](https://dash.cloudflare.com/profile/api-tokens), with **Account → Workers Scripts → Edit** and **Account → Account Settings → Read**, scoped to the existing account. Save it in `.env` as `CLOUDFLARE_WORKERS_API_TOKEN`. Keep the separate `CLOUDFLARE_API_TOKEN` for Workers AI benchmarks. Cloudflare's [Workers token template](https://developers.cloudflare.com/fundamentals/api/reference/template/) documents the deployment permissions.
2. Keep `CLOUDFLARE_ACCOUNT_ID` and `AZURE_TRANSLATOR_KEY` configured in `.env`. The deployment command passes the Azure key to the secret command through stdin, never as an argument or public variable.
3. Configure `ALLOWED_EXTENSION_ORIGINS` in `wrangler.jsonc` for the builds being distributed. The current local unpacked build uses `chrome-extension://dnofmicolgpeckcgpdkcipalkhebongp`. IDs can differ by installation path; add your friends' actual IDs. A stable store distribution needs its published ID.
4. Set `AZURE_TRANSLATOR_REGION` in `wrangler.jsonc` to the Azure resource's region, or leave it empty for Global. The current resource is Global.
5. Run `bun run worker:deploy`. It uses Wrangler 4.148.0, deploys the Worker, uploads `AZURE_TRANSLATOR_KEY` as a server secret, reads the public workers.dev hostname, saves `SHVYD_AZURE_PROXY_URL` in `.env`, and rebuilds the credential-free extension. The URL is saved only after deployment and secret upload succeed. [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
6. Install/reload that exact build. Confirm blank key fields, included Azure access, a successful Azure connection test, Azure BYOK override, and disabled DeepL until BYOK is supplied.

A failed setup can leave a deployed Worker without a working secret; rerun after correcting the reported error. The command never changes the public release endpoint on a deploy or secret-upload failure. It does not change the Cloudflare or Azure pricing plan.

The handler accepts only Azure translation, validates target and format, enforces the existing 10,000-character selection limit, caps request bodies at 65,000 bytes, and returns only translation text. It does not forward arbitrary URLs or upstream headers. Errors expose no upstream response bodies or server credentials.

The prepared rate-limit binding allows 20 requests per minute per connecting IP. Cloudflare applies this limit per location; it is not a global character budget or billing cap. IP limits also share capacity among people behind the same network. Origin checks constrain browser requests, but neither origins nor an extension-embedded token authenticate public clients. Direct clients can still call a public endpoint. Keep Azure F0 and account monitoring; broader distribution needs a separate abuse/quota decision. [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

The application writes no request logs and disables Worker observability in its configuration. No database, translation history, or persistent text cache is added. Infrastructure-level handling remains subject to Cloudflare and Microsoft's policies. Release privacy text must describe the relay as a recipient of selected text.

## Local development and verification

The playground and benchmarks read `.env` on the local server. The live extension harness explicitly saves BYOK into its temporary Helium profile; the release artifact stays credential-free. Neither mechanism configures included Azure for distribution.

Verify the exact extension files contain no configured provider secrets, including after `build:local`, and that obsolete bootstrap files have been removed. Test routing through the existing provider-request boundary. A production relay still requires deployment and a live check through the released extension.

## Verification on 2026-10-07

- `bun run verify`: lint, formatting, strict type checking, 24 unit tests, and credential-free build passed. The shared-Azure/BYOK routing test failed before implementation and passed after it.
- Python benchmark tests: 17 passed.
- Installed Helium extension: 41 full checks and 11 focused settings checks passed. Fresh installs had empty Azure/DeepL fields and disabled DeepL. Real provider checks used explicitly configured BYOK in isolated profiles.
- Both build variants were scanned against configured key/token values; no credentials were found, and the legacy bootstrap was absent.
- A local diagnostic exercised actual background startup with sentinel legacy keys, confirming credential removal, preference preservation, subsequent BYOK saves, and refusal of settings requests from page scripts.
- The prepared relay was exercised with controlled upstream responses: server-key routing, formatted output, origin rejection, invalid target/provider/body rejection, oversized selections, and rate-limit denial before upstream calls passed.

These are local checks. They do not establish production relay availability; deployment and a live shared-route check remain outstanding.

The follow-up regression suite now has 27 passing tests, including the settings-store migration/BYOK boundary and both built artifacts. The store regression was observed failing before the migration policy moved into the store. A Wrangler dry run also passed. Live shared-route verification is blocked by deployment-token permissions, rather than by an Azure key or build failure.
