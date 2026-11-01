# Shvyd

A small Chromium extension for translating selected text without leaving the page. Azure is the default provider; DeepL is available in settings. Ukrainian is the initial target. Choose whether each new popup remembers the last language or always starts with a fixed default.

The popup uses consistent SF Pro / system typography with 15 px translation text. On macOS it uses the native system font; other platforms use their system sans-serif fallback. It takes background, text and accent colors, border, corner radius, and shadow from the area around the selection. Text contrast is checked before using the sampled colors. You can switch page adaptation off in settings.

Drag the empty space in the popup's top bar to move it. The window stays inside the viewport, keeps its position when you change languages, and moves its language menu with it. Each new popup starts beside the selected text again. Selected underlined text, including underlined links, keeps its underline in the translation.

Selected paragraphs, headings, emphasis, lists, and table cells keep their structure in the translation. Code stays unchanged. The Copy button keeps paragraph breaks, list markers, and table columns as plain text. This uses one provider request; see [selection formatting](docs/formatting.md).

## Install a release

Download the release ZIP and follow [install, update, and roll back](docs/install.md). Changes are listed in the [changelog](CHANGELOG.md); maintainers package releases with `bun run package` as described in [releasing](docs/releasing.md).

## Load the prototype in Helium

```sh
bun install
bun run build
```

1. Open `chrome://extensions` in Helium or another Chromium browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this project's `dist` directory.
4. Reload a normal web page, select some text, and click **Translate**.

Both `build` and the compatibility command `build:local` produce credential-free files. `.env` is used only by local servers, provider benchmarks, and explicit live-test BYOK setup. The build removes the obsolete `dist/local-settings.json` credential bootstrap.

Click the toolbar icon to open settings. Azure uses the included Cloudflare endpoint by default; adding your own Azure key overrides it and calls Azure directly. Removing that key restores included access. DeepL is disabled until you add your own DeepL key. Fields contain only keys you explicitly supplied, including through the optional `.env` import.

On the first upgrade from the old bootstrap build, saved credentials are cleared once because those records did not distinguish owner keys from BYOK. Language and appearance preferences remain. Reenter any personal BYOK credentials you want to keep.

The bundled catalog has 173 targets across the two providers. Choose your preferred languages in settings; the popup shows those first, with a searchable **More languages** menu for the rest. The language menu opens in a separate popover, so expanding or searching it keeps the translation window still. It follows its button when the browser is resized. You can hide the additional-language menu. Target choices follow provider support, and preferred languages stay saved across provider changes. See [language choices](docs/languages.md) for the default-language modes and catalog details.

The background worker sends BYOK requests directly to Azure or DeepL. Included Azure access uses a server relay that holds the owner's key; the extension receives only the public endpoint URL. See [shared Azure setup](docs/shared-azure.md); `bun run worker:deploy` deploys it and rebuilds the extension using the dedicated deployment token. The public endpoint is already the release default. User keys are stored in extension-local storage restricted to trusted extension contexts. The page popup receives only public preferences and translated text.

Settings also show local usage counts, a DeepL allowance check, and optional error records you can export for support. They stay in this browser; see [local usage](docs/local-usage.md).

## Run the playground

```sh
pnpm playground
```

Keep the terminal running and open [the live playground](http://localhost:5173). Press **Ctrl+C** in that terminal when you want to stop it. The playground has eight styles: editorial, technical, journal, warm, forest, contrast, neon, and gradient. Select short or long passages, multilingual and right-to-left text, code, table cells, or text inside nested cards and scroll containers. **Language settings** lets you try preferred languages, a fixed default, and neutral styling in the demo.

The demo uses a loopback server to call Azure or DeepL using `.env`. Its preferences last until that server restarts. The actual extension stores its preferences across browser restarts. For testing the installed extension rather than the demo's injected UI, use [the extension fixture](http://localhost:5173/fixture?style=editorial).

The HTML page is [demo/test-page.html](demo/test-page.html). It also works with a plain static server and the installed extension:

```sh
python3 -m http.server 5174 --bind 127.0.0.1 --directory demo
```

Open [the static test page](http://localhost:5174/test-page.html). Its theme picker and selection helpers work without Bun or a demo API server. Configure translation through the extension's own settings. Serve it over HTTP so the extension can run on the page.

## Development and verification

```sh
pnpm fix
pnpm check
python3 -m unittest scripts.test_benchmark_cloud scripts.test_benchmark_opencode_go
```

`fix` applies safe Oxlint fixes and Prettier formatting, then runs all checks. `check` and `verify` run lint, formatting checks, strict TypeScript checking, the prototype's behavior tests, and a credential-free build. Use `lint:fix` or `format` to run only the editing step. Saved benchmark results, verification evidence, generated files, and local credentials are excluded from formatting.

Development tools are installed with `bun install`; `pnpm` runs the commands using those local dependencies. Linting uses Oxlint. Prettier uses single quotes, no semicolons, and two-space indentation. Type checking uses TypeScript 7.

Run the reliability checks without provider keys or a playground server:

```sh
bun run test:reliability
```

This builds the extension and checks delayed replies, language-save failures, rapid target changes, closing, network retry, error classifications, an actual background-worker restart, persistent usage counts, and redacted error-record export in an isolated Helium profile. It requires Helium and Python's `websocket-client`. Results stay in `.preview/reliability-check/`. These browser checks run locally; CI runs the unit tests. See [request reliability](docs/translation-reliability.md) for cache behavior and verification details.

To run live checks, configure provider keys in `.env` and leave the demo server running in another terminal. The extension harness explicitly adds BYOK credentials to an isolated profile; it does not embed them in the build:

```sh
bun run build
python3 scripts/check-extension.py
python3 scripts/check-demo.py
```

The live check uses a temporary Helium profile, leaving the regular profile alone. It covers both providers, eight page styles, preferred and additional languages, remembered and fixed targets, right-to-left output, formatted paragraphs and lists, underlined links, table cells, unchanged code, long selections, nested cards, window dragging, language-menu anchoring, viewport bounds, and Escape dismissal. The demo check also uses controlled provider responses to verify partial selections, safe HTML rendering, and copying. These scripts use the `websocket-client` Python dependency already required by the local benchmark harness. Screenshots and results are written under the ignored `.preview/extension-check` and `.preview/demo-check` directories. Earlier verification artifacts are retained locally in `.preview/prototype/`. Generated verification artifacts are not tracked in Git.

## Prototype boundaries

- Translation is sent after clicking the selection button. Source detection happens in the same provider request.
- The selected-text limit is 10,000 characters. Browser internal pages, protected store pages, browser PDF viewers, and text inputs are outside this first pass.
- Repeated selections use an in-memory cache capped at 32 entries and 512 KiB of UTF-8 payloads. Identical simultaneous requests share one provider call. Saving full settings or restarting the background worker clears the cache; saved preferences and keys remain in browser storage.
- Page styling is sampled from computed styles. Image backgrounds, unusual layouts, and custom web components may need a neutral fallback or further refinement.

## Project notes

- [First stable release plan](docs/release-plan.md)
- [Settings design brief](docs/settings-design-brief.md)
- [Provider choices and measured results](docs/translation-options.md)
- [Future ideas and open questions](docs/future.md)
- [API key setup](docs/api-keys.md)
- [Benchmark archive](docs/benchmarks/README.md)
