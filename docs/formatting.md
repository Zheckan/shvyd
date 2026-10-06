# Selection formatting

Updated 2026-10-04. Formatting is automatic when you select text and click Translate. Paragraph boundaries come from the selected page elements, rather than guesses based on translated sentences.

The popup keeps paragraphs, headings, explicit line breaks, bold and italic emphasis, underlining, bullet lists, numbered lists, nested lists, quotations, and table rows and cells. Selecting part of a numbered list retains its starting number. Selecting one table cell translates only that cell. Code blocks and inline code keep their original text and line breaks.

Underline tags and CSS underlining on selected elements become safe underline markup. An underlined link keeps that emphasis in the translation while its destination and other page attributes are discarded. Nested bold or italic text keeps both kinds of emphasis.

Typography stays SF Pro / the system sans-serif font at the popup's normal text size. Paragraph spacing, list indentation, borders, and emphasis use the popup's own styles. Source fonts, exact pixel spacing, link destinations, and page controls are not copied. Long formatted results still scroll inside the popup.

The Copy button produces plain text with blank lines between paragraphs, list markers, and tab-separated table columns. It does not put HTML tags on the clipboard.

## Provider requests

The content script captures the selected DOM range, keeps a small set of formatting elements, and removes page attributes. It includes only the selected text. Hidden nodes are omitted. Block containers built with CSS also become separate blocks; a line that merely wraps to fit the source page stays part of its paragraph.

Formatting uses one translation request and automatic source detection:

- Azure receives an input with `textType: "html"` through the existing `2026-06-06` API. See the [Azure translate reference](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/2026-06-06/translate-api).
- DeepL receives `tag_handling: "html"` and `tag_handling_version: "v1"`, keeping `model_type: "latency_optimized"`. This combination was checked with the configured API key. See [DeepL HTML translation](https://developers.deepl.com/docs/translate/translating-html) and its [request parameters](https://developers.deepl.com/api-reference/translate/request-translation).
- Code uses `translate="no"` and `class="notranslate"` in the outgoing structure so the providers retain it.

Returned markup is parsed in an inert template. The popup creates fresh elements from the allowed formatting tags, keeping only bounded numeric list and table attributes. Scripts, embedded content, media, links, styles, event handlers, and page identifiers cannot enter the rendered result. Link text remains readable.

The cache includes plain versus HTML format as well as provider, target, and text. Literal angle brackets in a plain-text response remain literal text.

## Limits and verification

The request limit remains 10,000 characters. If formatting would exceed that limit, or the DOM structure exceeds 4,000 visited nodes or 40 levels, capture falls back to the selected plain text. Unusual page markup can also use this fallback. This is structural preservation, not an exact copy of the page's layout. Providers may move inline emphasis while translating word order.

Use the **Paragraphs and lists** passage and **Code, tables, and scroll containers** section on [the playground](http://localhost:5173/fixture). The [formatting verification report](prototype/2026-10-03/formatting/report.md) records live provider checks and controlled response checks for partial selections, safe rendering, and copying.

The [underlining and movable-window report](prototype/2026-10-04/popup-interactions/report.md) adds live Azure and DeepL underline checks plus a controlled regression for CSS underlining, nested bold text, and removal of source attributes.
