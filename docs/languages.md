# Language choices

The bundled catalog was refreshed from the providers on 2026-10-03. It contains 173 distinct targets: 138 from Azure and 126 from DeepL. The overlap means these counts do not add up to the combined total. Languages and regional or script variants are separate entries when the provider exposes them.

The picker uses the bundled snapshot, so opening it never waits for a language-catalog request. Provider language codes are preserved for requests, including Traditional Chinese and regional variants. Targets unavailable with the current provider are excluded from the picker and rejected before sending selected text.

## Preferred languages

Open the extension's settings and choose **Your preferred languages**. Search by English name, native name, or language code. The initial preferences are Ukrainian, English, and Polish. New choices appear in the order you add them. Remove a chip or uncheck its entry to remove a preference. At least one preferred language is required.

Click the target language in the popup to open the menu. It shows your available preferred languages and the current target. **More languages** opens a searchable list of every target available with the current provider. Disable **Show More languages in the popup** if you want to keep the menu limited to your preferred choices and the current target.

The language menu is a separate popover anchored to the target button. Opening it, expanding **More languages**, searching, or closing it keeps the translation window's size and position unchanged. It follows the button when you drag the translation window or resize the browser, opens above or below according to available space, and scrolls in a short window.

Arrow keys, Home, and End move through language choices. Escape closes the language menu first and returns focus to the target button. A second Escape closes the translation window. Clicking the translated text closes only the language menu; clicking outside the translation or deliberately scrolling the page closes both.

Preferred languages stay saved across provider changes. Unavailable preferences reappear when you choose a provider that supports them. If the remembered target or default becomes unavailable, the extension uses the first preferred language supported by the new provider, falling back to Ukrainian if necessary.

## Starting language

| Setting              | Next popup                          | Changing the target inside a popup   |
| -------------------- | ----------------------------------- | ------------------------------------ |
| Remember last used   | Starts with your last chosen target | Saves the choice for later popups    |
| Always use a default | Starts with the configured default  | Applies only until that popup closes |

In default mode, closing the popup through its close button, Escape, outside click, or page navigation ends the temporary choice. The next popup starts with the default. The previous remembered target remains separate, so switching back to Remember last used restores it.

Old settings receive the new language preferences without losing the existing target or provider keys. Arabic, Hebrew, and other right-to-left targets use the appropriate text direction in the translation.

## Catalog refresh and verification

Run `bun run languages:update` with the existing `DEEPL_API_KEY` configured to refresh the snapshot. The script queries [Azure's languages API](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/preview/get-languages) and [DeepL's text-translation languages API](https://developers.deepl.com/docs/languages/using-the-languages-api). It includes stable DeepL targets and does not write credentials into the catalog. Review the generated diff, run `bun run check`, and rebuild the local extension afterward.

Azure keeps its standard translation route. DeepL keeps `latency_optimized`. Small live English-source probes to Hindi, Arabic, Traditional Chinese, and Aymara all returned successful DeepL translations with that mode. This is an eligibility spot check, not a speed or quality ranking for every pair. The catalog reports provider support; every language pair has not been individually tested.

See the [language and playground verification report](prototype/2026-10-03/languages/report.md) for the functional checks and screenshots.
See the [separate language popover verification](prototype/2026-10-03/language-popover/report.md) for menu layout, keyboard behavior, and resize checks.
