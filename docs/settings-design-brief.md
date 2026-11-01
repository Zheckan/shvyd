# Settings design brief

Updated 2026-10-07. Use this brief to design Shvyd's settings page for its first stable release. The page opens in an extension tab. The current version is functional, and the design should preserve its behavior while making setup and everyday preferences easier to understand.

The [release plan](release-plan.md) defines scope and implementation order. This document describes the desired UI; controls labelled planned do not exist yet.

## Product and visual direction

Shvyd translates selected page text into a small movable window, so the reader can continue without opening a translator website. Speed and low maintenance matter more than a large feature list. The first users are the owner and one or two friends. Included Azure access uses a server relay; users can override it with their own key. DeepL requires their own key.

Use consistent SF Pro / system typography. On macOS, use the native system font; provide system sans-serif fallbacks elsewhere. The page popup keeps its existing 15 px translation text. Settings may use a clear hierarchy of text sizes. Do not borrow fonts from the page being translated or add a font download.

The settings page has its own light/dark appearance. Page adaptation applies to the translation popup, rather than the settings page. Prefer restrained colors, readable labels, compact controls, and clear focus states. Give the design room to work in a narrow window and at 200% zoom. Avoid account, billing, subscription, and chat UI.

Suggested grouping: Translation, Languages, Appearance, Usage and diagnostics, and About. A sidebar or simple grouped page can work. Keep primary setup visible when a key is missing; do not make a first-time user search inside an advanced section.

## Translation provider

Existing controls:

- Provider selection: included Azure by default; DeepL disabled until BYOK is supplied.
- Azure key and location code. An empty code means Global.
- DeepL key and official endpoint selection: API Free / Developer or API Pro / Growth.
- Masked key inputs and explicit Save settings.

Planned controls and states:

- Separate "Key saved" from "Connection verified". A populated field does not prove the key works.
- An explicit Test connection action, a short explanation of what is sent, an in-progress state, and the result. No automatic test while typing or opening settings.
- A deliberate way to remove a provider key, without clearing unrelated preferences.
- Concise setup links and helpful messages for rejected credentials, missing region, temporary rate limits, exhausted allowance, and network failure.
- Keep inactive-provider setup available without cluttering the active-provider path. Preserve both providers' saved credentials when switching.

Do not display the owner's Azure account balance or assume every Azure user has the same plan. Provider costs belong to the configured account. State that DeepL Developer's current free allowance is finite; link setup documentation instead of turning settings into a pricing comparison.

The `.env` import is an existing developer convenience. If retained, place it in an advanced section and explain that users normally paste a provider key. Keys are saved in browser-local extension storage and sent to the chosen provider for authentication. They must never appear in a diagnostic export or page popup.

## Languages

Preserve these existing choices:

- "Remember last language" starts a new popup with the last target.
- "Always start with" uses a fixed default. A temporary target change inside the popup does not replace that default; the next popup starts with the default again.
- Preferred languages appear first in the popup.
- The additional-language menu can be shown or hidden and is searchable.
- Available targets follow the selected provider. Preferred choices remain saved across provider switches.

Ukrainian is the initial target; the initial preferred set also contains English and Polish. Allow searching the provider-supported catalog, rather than presenting every language as one long list. The current catalog and behavior are described in [language settings](languages.md).

Show which target will be used next. If switching providers makes a target unavailable, explain the supported fallback. Do not silently make the fixed default behave like the remembered target.

## Appearance

Keep "Match the page's style" as the existing toggle. Explain that it adapts nearby colors, borders, corners, and shadow while keeping the font consistent. Off uses the neutral popup styling.

A compact preview can show a paragraph, a heading, and an underlined phrase. Use static sample content, so opening settings does not trigger a provider request. The popup's dragging, language popover, and formatting behavior remain part of the product; settings do not need controls for every interaction.

## Usage and diagnostics, planned

Usage should show local daily/monthly summaries by provider, successful source-character estimates, request counts, and cache hits. Include the tracking start date and explain that these estimates cover this installation. Do not turn an estimate into an authoritative remaining-quota bar.

For DeepL, an explicit Refresh provider usage action can show fetched account consumption, the returned limit, and the check time. Keep it visually separate from local counts. Azure F0 does not currently expose the equivalent cumulative character metric in the portal.

Diagnostics should offer an off-by-default local recording toggle, a compact recent-error view, export with preview, and clear controls. Records contain metadata rather than source text, translations, keys, or page identities. Clearing diagnostics and clearing usage summaries are separate actions. The exact retention proposals are in the release plan.

Provide a way to clear the in-memory translation cache. Explain that its current contents disappear when the extension worker restarts. Do not add a translation-history view.

Central sharing is a later option. If shown in a concept, mark it as outside the first release and show its opt-in disclosure separately from local recording. A disabled placeholder is not required in the shipped settings page.

## About, privacy, and data controls

Include extension version, setup/help, privacy notice, usage terms, and a support/report-issue link. Contact information will be supplied before publication.

Explain the basic flow near provider setup: selected text goes to the chosen provider after the user clicks Translate. Included Azure requests pass through Shvyd’s relay; BYOK requests go directly to the chosen provider. Shvyd has no application account. The owner’s key never belongs in the extension or its settings fields.

Use scoped clear controls. Removing a key, clearing logs, clearing usage, and resetting everything have different consequences. A full reset should explain that it removes provider credentials and saved preferences before the user applies it.

## Deliverables and acceptance

Produce the normal page plus first-use, saved-but-unverified, validation-success, validation-error, no-supported-target, empty-usage, and populated-diagnostics states. Include a narrow layout, light/dark examples, and keyboard focus states. Demonstrate Save, saving, saved, and unsaved changes; preserve explicit saving of credentials.

Keep controls labelled, associate validation with the relevant field, and announce asynchronous results to assistive technology. Keep key entry usable with password managers without exposing values in presentation artifacts. Do not copy real keys or account details into mockups.

Implementation remains the existing lightweight TypeScript/HTML/CSS extension. Entry points are `extension/options.html`, `extension/options.css`, `src/options.ts`, and `src/language-settings.ts`. Preserve extension-local routing and the background-worker boundary for credentials. The design does not require a framework, remote assets, or analytics SDK.
