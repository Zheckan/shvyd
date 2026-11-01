# First stable release plan

Updated 2026-10-31. This plan is for the first stable release, intended for personal use and one or two friends. It does not require a beta programme or promotion. Settings, request reliability, local usage and diagnostics, and release packaging are implemented on the stacked implementation branches. The remaining release work is the privacy notice, usage terms, license, and the owner decisions listed at the end. No release has been published.

## Decisions for this release

| Area               | Decision                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Translation        | Azure standard translation remains the default. DeepL remains a selectable alternative with the user's own key.                  |
| Azure account      | Keep the owner's existing resource on F0. Monitoring is already arranged by the owner. No pricing-tier change is planned.        |
| Credentials        | All builds contain empty credentials. Azure BYOK overrides included access. DeepL requires BYOK.                                 |
| Application server | Included Azure uses a server relay holding the owner's key. BYOK requests go directly to the provider. No user accounts.         |
| Cache              | Keep 32 entries and a 512 KiB payload cap; identical simultaneous requests share one provider call.                              |
| Storage            | Use `chrome.storage.local` for settings and small local usage summaries. No application database is needed.                      |
| Diagnostics        | Keep bounded, optional local error records and provide an export for support.                                                    |
| Central reporting  | Optional follow-up, disabled by default if introduced. It is a separate decision from local diagnostics.                         |
| Distribution       | Begin with a versioned, credential-free ZIP for manual installation. A Chrome Web Store listing is a separate distribution task. |
| Offline            | Still speculative. See [future ideas](future.md).                                                                                |

The release icon is the supplied **3c-acid** version. Its SVG source and
16, 32, 48, and 128 px PNG exports live in `extension/icons/`. The extension
manager, toolbar, settings header, and settings tab use this identity.

DeepL's provider picker, masked key input, and official endpoint choice already exist. They need a clearer first-use experience, rather than a new integration. The current free API Developer plan provides one million characters total without a reset. That allowance belongs to the user's provider account. Azure F0 provides two million characters per month. [DeepL plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans), [Azure pricing](https://azure.microsoft.com/en-us/pricing/details/translator/)

Friends can configure their own Azure resource as well. Included access consumes the owner's allowance through a relay; its key stays on the server. Never include it in a distributed ZIP, repository, screenshot, or settings export. The relay is deployed and verified from the installed extension with empty key fields. See [shared Azure setup](shared-azure.md) for deployment, limits, and the one-time removal of legacy credentials.

## What works now

- Selected-text translation through Azure and DeepL, including provider-supported target languages.
- Preferred languages, a searchable additional-language popover, and remembered or fixed default targets.
- Page color and surface adaptation with consistent SF Pro / system typography.
- Paragraphs, headings, lists, emphasis, underlines, table structure, and unchanged code.
- Copying, dragging, viewport placement, and language-menu anchoring.
- Local settings persistence with credentials restricted to trusted extension contexts.
- An in-memory cache capped at 32 entries and 512 KiB of UTF-8 payloads, keyed by provider configuration, target, format, and source. Identical in-flight requests share one call. Saving full settings and worker restarts clear it.
- Distinct messages for rate limiting, exhausted quota, connection failures, and timeouts. Popup results are guarded against closing and rapid target changes, including delayed preference saves.
- A local Usage section with per-route request, character, reuse, failure, and uncertain counts; a DeepL allowance check; and optional, exportable error records. See [local usage](local-usage.md).
- A playground and repeatable browser checks. See [README](../README.md) for commands; generated screenshots and results stay in `.preview/`.

The selection limit is currently 10,000 serialized input characters. Browser internal pages, protected store pages, browser PDF viewers, and text inputs are documented prototype exclusions. Decide whether to retain these exclusions for 1.0; they do not need to become new features to release.

## Settings and first use

Use the [settings design brief](settings-design-brief.md) for the next design pass. Keep the normal path short: choose a provider, add its key, save, and translate. Existing users keep preferences. This security upgrade clears legacy credentials once; old records cannot distinguish owner bootstrap keys from BYOK.

Required states include an empty key, a saved but unverified key, successful validation, rejected credentials, temporary rate limiting, exhausted quota, and a network failure. The current "ready" label only means a key is present. Replace it with accurate status text.

A connection test must be an explicit user action. Explain whether it sends a small sample and consumes characters. A DeepL usage check can use its authenticated `GET /v2/usage`; show the response's allowance and when it was checked. Do not invent an Azure remaining-quota value or treat a rate-limit response as proof that the monthly allowance is exhausted. [DeepL usage API](https://developers.deepl.com/api-reference/usage-and-quota/check-usage-and-limits)

The owner's Azure F0 dashboard was checked on 2026-10-05. It showed request counts, while the translated-character chart failed to retrieve data. Microsoft's support clarification says cumulative character consumption is not currently exposed for F0 through the portal or billing APIs. Local estimates therefore need an explicit label. [Azure F0 metrics clarification](https://learn.microsoft.com/en-us/answers/questions/5817839/on-azure-translate-resource-i-cannot-see-the-trans)

Keep provider selection explicit. Errors should offer a retry or a link to settings. Switching providers should require the user's choice, because it changes the recipient of their text and the account charged for the request.

## Caching and storage

The cache now keeps at most 32 entries and 512 KiB of UTF-8 encoded keys and serialized results. Oversized results are returned without caching. Identical in-flight requests share one provider call; failures are not cached. Saving full settings invalidates pending cache writes as well as stored entries. Measure hit rate before expanding it. See [request reliability](translation-reliability.md) for the implemented behavior and regression checks.

The cache separates credentials, region or endpoint, plain and formatted input, targets, and providers. The popup ignores stale results as soon as a selection closes or its target changes. Closing hides a result without aborting the shared provider call, which may still serve another caller or populate the current cache. Future usage counters must count provider calls once and exclude cache hits.

Keep source and translated text in memory. Persisting translations would retain potentially private page content, so disk caching and translation history need their own user-facing decision. If worker eviction makes cache misses frequent, evaluate bounded `chrome.storage.session` storage before using a persistent database. Chrome documents session storage as memory-backed, surviving worker lifetimes but clearing on browser restart, extension reload, update, or disable. [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)

Use `chrome.storage.local` for preferences, keys, and bounded metadata. Keep `TRUSTED_CONTEXTS` access and avoid key synchronization. Local extension storage is not a password vault; describe its actual protections without claiming encryption that we do not implement. IndexedDB becomes worth considering only if a later feature needs substantial queryable history or a larger persistent dataset.

## Local usage and diagnostics

Implemented; see [local usage](local-usage.md) for the shipped behavior. The original requirements follow.

Add a local Usage section with provider requests, cache hits, successful source-character estimates, and failed or uncertain attempts. Track by provider and date. It helps the owner understand testing and day-to-day consumption without introducing an account system.

The usage audit on 2026-10-05 found 222 successful Azure requests and 101,623 source characters in the preserved [first cloud run](benchmarks/2026-10-02/cloud-190653/results.json), [realistic text run](benchmarks/2026-10-02/cloud-191659/results.json), and [later comparison](benchmarks/2026-10-02/go-195318/results.json). That is about 5.08% of a two-million-character allowance. The live portal showed 393 calls over the preceding week, including two errors. The benchmark character total excludes unrecorded prototype and personal use and must not be presented as the account's current total or remaining quota.

These counters cover this installation from the time tracking begins. They cannot know about another browser, a friend's installation, or another app using the same key. Provider accounting can differ for formatted input, Unicode, or a request that completes after the client times out. Label estimates accordingly. Calendar-month summaries must not claim to match a provider's billing cycle. DeepL's fetched usage is separate account data and may include other applications.

Recommended local data:

| Data                  | Retention and controls                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily usage summaries | Last 90 days; clearable. Counts only, with no text or page identity.                                                                              |
| Error diagnostics     | Off by default; at most 100 records or seven days, whichever removes records sooner.                                                              |
| Diagnostic fields     | Time, extension version, provider, error category, HTTP status if available, duration, and a random request reference.                            |
| Export                | Preview and download the bounded records. Credentials, headers, provider bodies, selected text, translations, URLs, and page titles are excluded. |

Use structured, allowlisted records rather than raw exceptions or request dumps. Separate rate limits from exhausted allowance when the provider supplies enough information. Unknown failures remain unknown. Exported logs help reproduce errors; they do not provide a history of what someone read.

Record usage when the provider call actually occurs, rather than every popup render or target-menu action. Storage and diagnostic failures must not prevent a translation from appearing. Verify persistence across worker restart, concurrent updates, clearing, and export redaction with targeted tests.

## Can the owner see other people's usage?

BYOK provider requests do not pass through a Shvyd server. Included Azure requests pass through the relay; its application does not record selected text or keys. Local logs stay on each user's device, and an Azure account meter cannot identify which extension user made a request. Friends can export their diagnostics when reporting a problem.

If that becomes insufficient, add an optional "Share diagnostic counts" feature in a later PR. Before selecting a host, define the actual questions: Are requests failing? Which provider is slow? Does the cache help? How many opted-in installations use a version? Avoid collecting browsing activity to answer those questions.

A small HTTPS ingestion endpoint plus a managed event store would be enough. Its dashboard could show daily request counts, error rates, duration distributions, version adoption, and cache-hit rates. This storage would serve diagnostics, while translation would continue going directly to the provider.

Before enabling it:

- Define an allowlisted event schema with coarse text-size buckets, provider, version, result category, duration, and cache outcome. Do not include text, translations, credentials, URLs, page titles, or language choices without a justified need.
- Make sharing opt-in, explain the fields before enabling it, and provide a control to stop future uploads and clear queued events.
- Avoid a stable installation identifier unless the approved questions require it. A pseudonymous identifier is not a promise of anonymity.
- Choose the host, processing region, access controls, and deletion mechanism. Limit detailed event retention to seven days as a starting proposal, and document any aggregate retention separately.
- Account for IP addresses and infrastructure access logs, even when the event payload contains no IP field. Review applicable privacy obligations and vendor processing terms before launch.
- Bound payload size, ingestion rate, and retry queues. Treat client-supplied events as untrusted. Keep dashboard access private; a credential shipped inside an extension cannot secure it.
- Batch uploads outside the translation path. Telemetry outages must not affect translation. Explain whether older opted-in events may upload after the connection returns.
- Document deletion limitations and whether previously submitted events can be associated with a deletion request. Do not promise identifiable-user deletion while deliberately retaining no way to identify that user's events.

Do not add a database, hosting bill, or analytics dependency to the first release just to leave this possibility open.

## Privacy, terms, and distribution

Write a short privacy notice that matches the shipped build. It must explain the selected text and sanitized formatting sent to the chosen provider, credentials sent to that provider for authentication, browser-local settings and caches, any usage counters, diagnostic retention, and how to remove local data. Link the relevant provider policies. Do not describe a cloud translator as transmitting no user data.

If central reporting is implemented later, update the notice before enabling collection. State who operates the endpoint, why events are collected, which service receives them, retention, infrastructure logging, and the available controls.

For a Chrome Web Store listing, Google requires an accurate privacy policy for products handling user data, secure transmission, and disclosures matching actual behavior. An unlisted listing still requires store submission and review. These store requirements are separate from the manual ZIP distribution chosen for initial personal sharing. [Privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy), [disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements), [publication guide](https://developer.chrome.com/docs/webstore/publish)

Prepare concise usage terms covering user-owned provider credentials, provider limits and costs, translation errors, service availability, and support contact. Confirm applicable provider terms before offering any shared-account service. Select a repository license deliberately. A software license, privacy notice, and usage terms have different jobs; none automatically replaces the others. Operator identity and contact details still need to be supplied before final documents are published.

## Work order and release checks

1. **Design settings.** Produce layouts from the brief, including first use, provider credentials, languages, appearance, usage, diagnostics, and error states. Keep planned controls visibly distinct from existing behavior in the design handoff.
2. **Implement settings and reliability.** Preserve saved data; add explicit connection validation, usable key removal, request deduplication, bounded cache size, and accurate rate-limit/quota messages. Check keyboard navigation, focus, loading states, and stale responses.
3. **Add local observability.** Implement counters, bounded diagnostics, clear/export controls, retention, and redaction. Keep central reporting a separate PR if it is approved later.
4. **Prepare distribution.** Packaging, changelog, and install/update instructions are done: see [releasing](releasing.md) and [install](install.md). Remaining: privacy notice, usage terms, and license. Add icons, versioned packaging, a changelog, installation/update instructions, a privacy notice, usage terms, and a license decision. Produce the artifact from a clean build and an explicit file allowlist. Both build commands are credential-free; package only the explicit release file allowlist.
5. **Verify the artifact.** Run `pnpm check` and relevant browser checks, then install the exact ZIP contents in fresh Chromium and Helium profiles. Verify empty credentials, both providers, update migration, unsupported pages, worker restart, language modes, safe formatted output, copying, dragging, keyboard use, errors, and clearing data. Inspect the ZIP for credentials and development files.
6. **Review and release manually.** The owner reviews and merges the stack. Tag and publish only when explicitly requested. Keep the last working release and document how to reinstall it without losing settings.

Every build removes the obsolete credential bootstrap. Verify that the release contains no provider credentials, including when rebuilding an existing `dist/`.

Measure click-to-visible translation and popup responsiveness on representative short and long selections, with cold workers, warm workers, and cache hits recorded separately. Reuse the same input corpus for before/after comparisons and report slower responses as well as medians. Provider-call benchmarks alone are not proof of the finished UI's responsiveness.

## Decisions still needed before publication

- Final review of the implemented settings design and selected 3c-acid icons.
- The license, operator/contact information, and final privacy/usage text.
- Whether distribution should stay a manual ZIP or also use an unlisted/public store listing.
- Whether central diagnostics answer a real need after local exports are available.

Accounts, payment handling, more cloud models, translation history, persistent text caching, and offline models remain outside this release plan. A specific need can move an item into a later release.
