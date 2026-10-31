<!-- zrub:agents-project-guide:start -->

## Project overview

Shvyd is a Chromium extension (Manifest V3) that translates selected text in a
small popup styled to match the page. Azure Translator is the default
provider through a server relay; users can override it with BYOK. DeepL is
optional and requires BYOK. Builds contain no provider credentials.

The extension has three runtimes, and the playground adds a fourth:

- The content script shows the selection button and translation popup on
  every page. It never sees API keys.
- The background service worker stores settings and keys, calls the provider,
  and answers messages from the other contexts.
- The options page edits provider, language, and key settings.
- The playground (`bun run dev`) runs the same popup on a local test page and
  sends translations through a loopback Bun server that reads `.env`.

## Important paths and conventions

Source layout follows `docs/project-guides/project-structure.md`. Read it
before adding or moving files.

- `src/entries/`: bundler entry points (`content.ts`, `background.ts`,
  `options.ts`, and the playground's `demo.ts`). Keep them to wiring only.
- `src/features/`: `translator` (selection popup), `language-settings`,
  `settings-page`, `usage-settings`, `extension-router` (background message
  routes and who may send each), `managed-azure` (relay handler), and
  `playground`. Each feature's `mount*.ts` or `create*.ts` file is its public
  interface.
- `src/domain/`: `languages` (provider language catalog), `settings` (types,
  parsing, persistent store), `translation` (provider requests, request cache,
  status classification, message client), and `usage` (local counts and error
  records).
- `src/utils/`: product-agnostic helpers.
- `src/test/browser/`: scripts that `scripts/check-demo.py` runs in a page.
- `extension/`: manifest, options HTML, and CSS copied into `dist/` as-is.
  Each stylesheet keeps its own media queries; a new file must also be added to
  `scripts/build.ts` and `RELEASE_FILES` in `scripts/package.ts`.
- `demo/`: playground HTML, CSS, and script.
- `scripts/`: build, playground server, catalog update, live browser checks,
  and Python benchmark tools.
- `docs/`: provider research, language and formatting notes, benchmark
  archives, and release documentation.
- `.preview/`: local screenshots and raw browser-check results, ignored by Git.

Conventions:

- Import across folders with `@/` (mapped to `src/*`); use relative imports
  inside a feature or domain area.
- Unit tests sit next to their source as `*.test.ts` and run with `bun test`.
- Validate every message, storage value, and provider response with the
  `parse*` functions in `src/domain` before using it.
- Never send API keys to the content script. It receives only
  `publicPreferences` and translated text.
- Follow "Readable code" in the structure guide. Oxlint enforces braces,
  one declaration per statement, no chained assignment, and no nested
  ternaries. Prettier does not add blank lines; add them yourself.
- Prettier: single quotes, no semicolons, two-space indent. Oxlint denies
  warnings. TypeScript 7 runs in strict mode.

## Development and verification

```sh
bun install
bun run verify        # lint, format check, typecheck, unit tests, build
bun run fix           # lint fixes and formatting, then verify
bun run build        # credential-free dist/; build:local is a safe compatibility alias
bun run dev           # playground on http://localhost:5173
bun run package       # versioned release ZIP in release/; see docs/releasing.md
```

Load `dist/` with **Load unpacked** at `chrome://extensions` to try the
extension.

Live browser checks need provider keys in `.env` and the Helium browser. The
extension harness explicitly configures BYOK in a temporary profile. For shared
Azure routing or deployment, read `docs/shared-azure.md`.

```sh
bun run dev                          # keep running in another terminal
python3 scripts/check-demo.py
bun run build && python3 scripts/check-extension.py
```

Python benchmark tests: `python3 -m pytest scripts/test_benchmark_cloud.py
scripts/test_benchmark_opencode_go.py -q`.

CI (`.github/workflows/ci.yml`) runs format, lint, typecheck, unit tests,
build, and the Python benchmark tests on every pull request.

## FINDINGS

Findings live in `docs/findings.md`. Read it before starting and record new
findings there.

## Installed by zrub

This section is installed and updated by
[zrub](https://github.com/Zheckan/zrub#readme).

- Agent maintenance manual (updates, reinstallation, the GitHub standard):
  `docs/project-guides/zrub.md`
- GitHub repository setup standard (repository settings, the
  `main-protection` branch ruleset, and release-tag protection, with the exact
  `gh api` commands): https://github.com/Zheckan/zrub/blob/main/resources/github-repo-setup-profile/github-repo-setup-profile.md

<!-- zrub:agents-project-guide:end -->
