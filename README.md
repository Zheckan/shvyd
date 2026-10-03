# Shvyd

A small Chromium extension for translating selected text without leaving the page. Azure is the default provider; DeepL is available in settings. Ukrainian is the initial target. Choose whether each new popup remembers the last language or always starts with a fixed default.

The popup uses consistent SF Pro / system typography with 15 px translation text. On macOS it uses the native system font; other platforms use their system sans-serif fallback. It takes background, text and accent colors, border, corner radius, and shadow from the area around the selection. Text contrast is checked before using the sampled colors. You can switch page adaptation off in settings.

## Load the prototype in Helium

```sh
bun install
bun run build:local
```

1. Open `chrome://extensions` in Helium or another Chromium browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this project's `dist` directory.
4. Reload a normal web page, select some text, and click **Translate**.

`build:local` reads the Azure and DeepL credentials already configured in `.env` and creates an ignored, private `dist/local-settings.json` bootstrap file. It is used when the extension has no saved settings yet. Keep this local build on your machine; use `bun run build` to produce a build without credentials.

Click the extension's toolbar icon to open settings. There you can change the provider, target language, page adaptation, or keys. You can also import `.env` there. Existing saved settings take precedence over the bootstrap file, including after rebuilding or reloading the extension.

The bundled catalog has 173 targets across the two providers. Choose your preferred languages in settings; the popup shows those first, with a searchable **More languages** menu for the rest. You can hide that menu. Target choices follow provider support, and preferred languages stay saved across provider changes. See [language choices](docs/languages.md) for the default-language modes and catalog details.

The prototype runs directly in the browser. Its background worker makes the provider request, so no application server is needed. Keys are stored in extension-local storage restricted to trusted extension contexts. The page popup receives only public preferences and the translated text.

## Try the live demo

```sh
bun run dev
```

Open [the live playground](http://localhost:5173). It has eight styles: editorial, technical, journal, warm, forest, contrast, neon, and gradient. Select short or long passages, multilingual and right-to-left text, code, table cells, or text inside nested cards and scroll containers. **Language settings** lets you try preferred languages, a fixed default, and neutral styling in the demo.

The demo uses a loopback server to call Azure or DeepL using `.env`. Its preferences last until that server restarts. The actual extension stores its preferences across browser restarts. For testing the installed extension rather than the demo's injected UI, use [the extension fixture](http://localhost:5173/fixture?style=editorial).

The HTML page is [demo/test-page.html](demo/test-page.html). It also works with a plain static server and the installed extension:

```sh
python3 -m http.server 5174 --bind 127.0.0.1 --directory demo
```

Open [the static test page](http://localhost:5174/test-page.html). Its theme picker and selection helpers work without Bun or a demo API server. Configure translation through the extension's own settings. Serve it over HTTP so the extension can run on the page.

## Development and verification

```sh
bun run check
python3 -m unittest scripts.test_benchmark_cloud scripts.test_benchmark_opencode_go
```

`check` runs strict TypeScript checking, the prototype's behavior tests, and a credential-free build. To run the live extension check on this Mac, leave the demo server running in another terminal:

```sh
bun run build:local
python3 scripts/check-extension.py
python3 scripts/check-demo.py
```

The live check uses a temporary Helium profile, leaving the regular profile alone. It covers both providers, eight page styles, preferred and additional languages, remembered and fixed targets, right-to-left output, long selections, nested cards, viewport bounds, and Escape dismissal. It uses the `websocket-client` Python dependency already required by the local benchmark harness. Screenshots and results are written under the ignored `.preview/extension-check` directory.

## Prototype boundaries

- Translation is sent after clicking the selection button. Source detection happens in the same provider request.
- The selected-text limit is 10,000 characters. Browser internal pages, protected store pages, browser PDF viewers, and text inputs are outside this first pass.
- Repeated selections use a bounded in-memory cache, separated by provider and target language. It clears when the background worker restarts. Saved preferences and keys remain in browser storage.
- Page styling is sampled from computed styles. Image backgrounds, unusual layouts, and custom web components may need a neutral fallback or further refinement.

## Project notes

- [Provider choices and measured results](docs/translation-options.md)
- [Future ideas and open questions](docs/future.md)
- [API key setup](docs/api-keys.md)
- [Benchmark archive](docs/benchmarks/README.md)
- [Prototype verification and screenshots](docs/prototype/2026-10-03/report.md)
- [Language settings and playground verification](docs/prototype/2026-10-03/languages/report.md)
