# Standalone HTML verification

Date: 2026-10-03. Command: `pnpm build:playground`.

The command generates `dist/playground.html`, one HTML file with the playground's CSS and controls included. It uses Node.js without a test-page server or additional package dependencies. The generated file is 23,949 bytes in this build. The source HTML, CSS, and JavaScript remain in `demo/` for editing.

The extension's content-script match patterns now include file URLs. The previous manifest only matched HTTP and HTTPS, so it could not inject the translation UI into a file opened from disk. File access remains subject to Chromium's per-extension setting. See [Chrome's match-pattern reference](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns).

## Checks

`pnpm check` passed strict TypeScript, all 17 prototype behavior tests, and the credential-free extension build. `pnpm build:local` produced the configured local extension build.

`python3 scripts/check-file-playground.py` passed five checks in a temporary Helium profile:

1. The generated HTML was copied by itself to a separate folder with a filename containing spaces. It opened from a file URL with no external stylesheet, script, or resource request.
2. All eight theme controls changed the page style on the local file.
3. The formatted-passage selection helper selected the expected text.
4. File access was confirmed through the extension's Details page. It was already enabled in this disposable unpacked-extension profile, so the final run left the toggle on.
5. The installed extension completed a live Ukrainian translation from the local HTML. The output retained three paragraphs and five list items, and its palette matched the technical theme.

The test uses no test-page server and leaves the regular browser profile alone. Provider requests still use the configured extension keys in its background worker.

- [Results](results.json)
- [Local-file translation screenshot](translation.png)

## Use and repeat

```sh
pnpm build:playground
```

Open `dist/playground.html` in Helium or another Chromium browser. Reload Shvyd, open its Details in `chrome://extensions`, enable **Allow access to file URLs**, and refresh the HTML page. Translation uses the extension's saved settings.

To repeat the automated check:

```sh
pnpm build:playground
pnpm build:local
python3 scripts/check-file-playground.py
```

This proof covers a single live Azure translation from a local file plus the page controls. The broader provider and formatting checks are recorded in the [formatting report](../formatting/report.md). It is not an offline translation mode.
