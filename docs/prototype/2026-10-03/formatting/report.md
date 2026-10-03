# Selection formatting verification

Date: 2026-10-03. Browser: Helium, using isolated temporary profiles. Sources were synthetic passages from the project playground. Regular browser profiles were left alone.

## Result

The installed extension keeps paragraphs, headings, bold and italic emphasis, nested bullets, numbered lists, explicit line breaks, tables, and code blocks. Azure and DeepL both returned structured Ukrainian translations. DeepL retained its latency-optimized model with HTML tag handling v1; the expanded Hindi target also accepted the formatted passage.

The original plain-text build failed the new browser check with zero paragraph, list, heading, and emphasis elements. After building the implementation, all structure assertions passed.

| Check | Result |
| --- | --- |
| Strict TypeScript | Passed |
| Prototype behavior tests | 17 passed |
| Credential-free and private local builds | Passed |
| Actual installed extension | 29 checks passed |
| Live demo and controlled provider responses | 10 checks passed |

The 29 extension checks include the previous language, typography, palette, viewport, and dismissal behavior. New checks assert three paragraphs, three bullet items including a nested item, two numbered items, heading, emphasis, and line break; three table rows and six cells; unchanged source code; a single selected table cell; a partial list starting at number 4; and all four paragraphs of the long passage.

The demo first completes five checks with live translation. Five further checks use controlled responses through the same public popup: selected portions of two paragraphs exclude surrounding and hidden text and page attributes; CSS block spans keep separate blocks; returned active markup is removed without execution or resource loads; copying keeps paragraph breaks, bullet markers, and table columns; excessive markup falls back to bounded plain text. These controlled cases are not provider quality measurements.

## Evidence

- [Installed extension results](extension-results.json)
- [Demo results](demo-results.json)
- [Azure paragraphs and lists](azure-paragraphs.png)
- [Azure table and unchanged code](azure-table.png)
- [DeepL paragraphs and lists](deepl-paragraphs.png)
- [Long translation with paragraph spacing](long-paragraphs.png)

The screenshots were visually inspected. The popup retained SF Pro / system typography, readable paragraph spacing and list indentation, and viewport-bounded internal scrolling.

## Repeat

```sh
bun run check
bun run build:local
# Start bun run dev in another terminal.
python3 scripts/check-extension.py
python3 scripts/check-demo.py
```

These checks use the existing websocket-client Python dependency and configured Azure and DeepL keys. The demo test changes only the running demo's in-memory language preferences.

## Scope

Formatting adds no runtime dependency and uses one cloud translation request. The content bundle is 42.2 KiB in this build. These checks establish structural preservation for the tested passages, not an independent translation-quality score or a latency comparison. Arbitrary custom components, page layouts, and all language pairs were not covered. Source pixel spacing and fonts are intentionally normalized to popup styles. Providers can reposition inline tags as target-language word order changes.

See [selection formatting](../../../formatting.md) for the supported elements, extraction bounds, clipboard behavior, and current provider documentation.
