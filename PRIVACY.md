# Shvyd privacy policy

**Draft, not yet published.** Operator name and contact are still to be added
(marked `TODO`). Effective date: set on publication.

Shvyd is a browser extension that translates text you select. This policy
describes what the extension and its translation relay do with your data.

## What leaves your browser, and when

Nothing is sent until you click **Translate** (or **Test connection** or
**Check allowance** in settings).

| When                        | What is sent                                                                                                                                                      | To whom                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| You click Translate         | The selected text with its basic structure (paragraphs, headings, lists, emphasis, underlines, tables, code) and the target language. Link addresses are not sent | The provider you chose: Microsoft Azure Translator or DeepL                                |
| Included Azure access       | The same, plus your IP address as part of the connection                                                                                                          | Shvyd's relay on Cloudflare Workers, which forwards the text to Microsoft Azure Translator |
| Your own Azure or DeepL key | The same, plus your API key for authentication                                                                                                                    | Microsoft or DeepL directly; Shvyd's relay is not involved                                 |
| Test connection             | The word "Hello" (5 characters)                                                                                                                                   | The chosen provider                                                                        |
| Check allowance             | Your DeepL key                                                                                                                                                    | DeepL, which returns your account's character usage                                        |

The relay does not store selected text, translations, or keys, and has request
logging turned off. It uses your IP address only to limit each address to 20
requests per minute; Cloudflare processes it as the network operator. The
provider handles the text under its own policy:
[Microsoft](https://privacy.microsoft.com/privacystatement),
[DeepL](https://www.deepl.com/privacy),
[Cloudflare](https://www.cloudflare.com/privacypolicy/).

Shvyd does not send page addresses, page titles, or browsing history anywhere,
and has no analytics, advertising, or accounts.

## What stays in your browser

Stored with the browser's extension storage, on this device only, and readable
only by the extension's own pages and background worker (not by websites):

- Settings and preferred languages.
- API keys you enter. They are stored as entered, not encrypted.
- Usage counts per day: numbers of requests, characters, reused results, and
  failures. No text or page details. Kept 90 days.
- Error records, only if you turn them on: time, extension version, provider,
  error type, HTTP status, duration, and a random reference. At most 100, kept
  7 days.
- Sites where you turned Shvyd off (host names only).

Recent translations are kept in memory to avoid repeat requests, and are cleared
when the browser stops the extension's background worker.

## Your choices

- Clear usage counts, error records, or hidden sites in Shvyd settings.
- Remove the extension to delete everything it stored on this device.
- Error-record downloads happen only when you click **Download**, and the file
  stays on your device unless you send it to someone.

## Changes and contact

Changes to this policy will be listed in the changelog and dated here.

Operator: `TODO name`. Contact: `TODO email`.
