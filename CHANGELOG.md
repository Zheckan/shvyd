# Changelog

Shvyd follows [semantic versioning](https://semver.org/). Each release is a
credential-free ZIP built with `bun run package`.

## 0.0.1 – trial build (unpublished)

### Added

- **Toolbar menu:** clicking the Shvyd icon opens quick settings in the style of the settings page: show or hide Shvyd on the current site, provider, target language, popup position, page style, and a link to all settings. Changes reach open tabs without a reload.
- **Don't show on this site:** from the toolbar menu. Open tabs on that site drop Shvyd at once, embedded frames follow their page, and turning it back on works without a reload. Settings → Hidden on these sites lists them, with **Show again**.
- **Compact Translate button**, on by default: the button shows only its icon. Turn it off in the toolbar menu or settings to show the word Translate too. A visible button follows the change at once.
- **Resizable popup:** drag any edge or corner. The opposite edges stay put, the text fills the new size, the window stays inside the viewport, and a double-click on an edge restores the default size. Each new popup starts at the default size.
- **Popup position:** next to the cursor (default) or at the end of the selection, in the toolbar menu and settings. Keyboard selections use the end of the selection.
- Local usage counts per day and route: Azure included access, Azure with your own key, and DeepL. Shows requests, characters, reused results, failures, and uncertain timeouts for today and the last 7, 30, and 90 days.
- DeepL allowance check using the saved key. Uses no characters.
- Optional error records, off by default: at most 100 records kept for 7 days, with preview, JSON download, and clear.
- Versioned, reproducible release ZIP built from an explicit file list, with a SHA-256 checksum and a credential scan.
- The settings header shows the installed version.
- Every install has the same extension ID, so included Azure works from any folder. Builds from before this change start once with default settings.
- `bun run package --store` writes the Chrome Web Store upload, which leaves out the manifest key.

### Changed

- The Translate button appears next to the selection in text fields and on pages that re-render selected text, instead of the top-left corner. Plain text fields, search fields, and text areas can be translated; password and other input types never offer translation.
- While loading, the placeholder matches the expected length of the translation, the popup opens with a short fade, and its height eases to the final size. No scroll bar appears while loading, and scroll bars follow the popup's light or dark surface.
- You can select and copy part of a translation without the popup closing.
- Lines and blank lines that a page draws from plain line breaks, such as YouTube descriptions, stay separate in the translation instead of running into one paragraph.
- The popup's accent follows the color of the page's link text. On X it was lavender, the browser's default link color.
- After Shvyd is reloaded, updated, or removed, the copy left in open tabs removes itself on the next selection instead of showing a Translate button that fails.
- Long translations fade out at an edge that hides more text instead of being cut off, and a divider appears under the popup's top bar once text scrolls beneath it.
- Identical simultaneous translations share one provider call. The memory cache is capped at 32 entries and 512 KiB.
- Rate limits, exhausted allowance, connection failures, and timeouts have separate messages.
- Late replies can no longer show an old language or reopen a closed popup.

### Security

- Builds contain no provider credentials. Included Azure access goes through a server relay; your own keys go directly to the provider.
- The first upgrade from the old bootstrap build clears saved keys once and keeps preferences.

## Prototype (before 0.0.1)

Development builds were labelled 0.1.0; numbering restarted at 0.0.1 for the first build shared for testing.

- Selected-text translation with Azure and DeepL, preferred languages, page-matched styling, formatting preservation, copying, and dragging.
