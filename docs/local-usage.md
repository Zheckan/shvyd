# Local usage and error records

Implemented on `feat/local-usage`, stacked above the reliability PR. Everything
here stays in the browser's extension storage. Nothing is sent to a Shvyd server.

## Usage counts

The settings page has a **Usage** section with Today, 7-day, 30-day, and 90-day
totals for each route: Azure included access, Azure with your own key, and DeepL.

| Column     | Meaning                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| Requests   | Provider calls that actually started, including connection tests               |
| Characters | Source characters of successful requests, including any formatting markup sent |
| Reused     | Memory-cache hits and joins onto an identical in-flight request; no allowance  |
| Failed     | Calls that ended in an error other than a timeout                              |
| Uncertain  | Timed-out calls; the provider may still have finished and charged them         |

Requests rejected before a provider call (empty selection, missing key,
unsupported language) are not counted. Counts are stored per local calendar day
and route, keep no text, page address, or language choice, and are removed after
90 days. **Clear usage** resets the counts and the "since" date and keeps error
records.

The counts are estimates for this browser only. They cannot see other browsers,
friends' installations, or other apps using the same key, and provider billing
can count formatted input or late completions differently. Azure F0 exposes no
character total, so Shvyd shows no Azure remaining allowance.

## DeepL allowance

**Check allowance** calls DeepL's authenticated `GET /v2/usage` with the saved
DeepL key. It translates nothing and uses no characters. The result shows used
characters, the limit, a percentage, and the check time. It is account-wide data
and can include other apps that use the same key.

## Error records

**Keep error records** is off by default. When on, each failed provider call keeps
one record with only these fields:

`reference` (random), `time`, `version`, `provider`, `code`, `status` (HTTP, when
available), and `durationMs`.

At most 100 records are kept, none older than seven days. Keys, headers, provider
bodies, selected text, translations, page addresses, and page titles are never
recorded. **Preview** shows the export, **Download** saves it as JSON for support,
and **Clear** deletes the records. Turning the option off deletes kept records.

## Implementation

- `src/domain/usage/usage.ts`: storage types, parsing, retention, and summaries.
- `src/domain/usage/createUsageStore.ts`: serialized updates against
  `chrome.storage.local` key `usage`. Storage is read on every operation, so a
  restarted worker continues from saved counts. Unreadable data starts fresh.
- The translation service reports `TranslationEvent`s through `onEvent`. One
  provider call produces one event, even when several callers share it. A
  throwing listener or failed storage write never affects the translation.
- `src/features/usage-settings/`: the settings-page sections.
- Usage messages are accepted only from the extension's settings page.

## Verification

Unit tests cover counting, reuse, failure categories, retention limits,
concurrent updates, restarts, damaged storage, write failures, and export
fields. `bun run test:reliability` adds three browser scenarios: counts surviving
an actual worker restart, a redacted opt-in export, and the settings page showing
and clearing usage.
