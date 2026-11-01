# Request reliability

Implemented on `feat/translation-reliability`, stacked above the icon PR. This
stage covers request sharing, memory bounds, actionable errors, and popup races.
It adds no translation history, database, persistent text cache, or request logs.

## Cache and simultaneous requests

The translation service holds at most **32 entries** and **512 KiB of payloads**.
The byte budget counts each UTF-8 encoded cache key plus its serialized result.
It is a payload budget, not an exact JavaScript heap bound; objects and in-flight
requests have additional overhead. Least recently used entries are evicted first.
An oversized translation is returned normally without caching or evicting useful
small entries.

Keys distinguish provider, credentials, Azure region or DeepL endpoint, shared
Azure routing, target, format, and trimmed source text. Identical overlapping
requests within one service share one provider call. They receive `cached: false`;
a subsequent memory hit receives `cached: true` and zero provider duration.
Failures are shared with waiting callers but never cached. A later retry sends
fresh work.

Saving full settings clears entries and detaches in-flight work from the cache.
An older call may finish for its existing callers, but cannot refill that cache
or delete a newer in-flight request. Worker termination clears all memory state;
settings and BYOK credentials remain in trusted browser-local storage. The relay
creates a service per incoming HTTP request, so cross-client request sharing is
not provided by the server.

Closing the popup ignores the response rather than aborting a call that another
caller may share. A successful ignored response can still populate the current
memory cache. Changing target invalidates the displayed request immediately,
including while a remembered-language save is pending. Only the current popup
may show a language-save failure, and that failure stops its loading indicator.

## Errors and deadlines

| Signal                                       | Classification   | Popup guidance                       |
| -------------------------------------------- | ---------------- | ------------------------------------ |
| HTTP 429                                     | `rate-limit`     | Wait briefly and retry               |
| Azure HTTP 403 with code 403001              | `quota`          | Check allowance or choose a provider |
| DeepL HTTP 456                               | `quota`          | Check allowance or choose a provider |
| HTTP 401 or other HTTP 403                   | `authentication` | Check settings; retry is hidden      |
| Fetch or response-body deadline, HTTP 504    | `timeout`        | Retry                                |
| Connection failure                           | `network`        | Check connection and retry           |
| Unreadable or other failed provider response | `provider`       | Retry                                |

These quota and rate-limit signals follow the official
[Azure status codes](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/status-response-codes)
and [DeepL API errors](https://support.deepl.com/hc/en-us/articles/9773964275868-DeepL-API-error-messages).
No raw provider error text is forwarded to the popup.

The existing 15-second deadline covers fetching and reading the response body.
Manual retry remains available for temporary failures. Requests are not retried
automatically and providers are not switched automatically. A failed or timed-out
attempt may still consume provider allowance; the extension cannot infer billing
from the error alone.

The relay forwards only sanitized quota, rate-limit, and timeout signals. **Its
updated handler must be deployed after review** to enable those distinctions for
included Azure. This PR changes the local handler without deploying production.
BYOK behavior and the popup fixes work in the built extension independently.

## Verification

The agreed test boundaries are the translation service, the mounted popup's
public UI, and the actual extension message interface.

```sh
bun run verify
python3 -m pytest scripts/test_benchmark_cloud.py scripts/test_benchmark_opencode_go.py -q
bun run test:reliability
```

Unit tests exercise UTF-8 byte eviction, oversized output, the 32-entry LRU limit,
request sharing, cache invalidation during a pending call, failed-request retry,
provider configuration separation, quota and rate-limit classification, and
response-body deadlines. The same service boundary tests relay transport errors.

The browser command needs Helium and Python's `websocket-client`; it starts a
local fixture server and a temporary browser profile itself. DevTools controls
external provider replies and a test fixture delays external storage writes.
The built extension's service, popup, and messages run normally. No real provider
key or API request is used. Observations are through the popup UI and extension
messages; tests do not call private popup or service functions.

Eight browser scenarios passed on 2026-10-07:

1. Old replies stay hidden as soon as a new target is chosen, before its save ends.
2. A dismissed language-save failure does not change the next popup.
3. A current language-save failure stops loading.
4. Rapid target changes display only the latest reply, even in reverse reply order.
5. A late reply cannot reopen a closed popup; the next selection works.
6. Network failure shows a retry action, and manual retry recovers.
7. Quota, rate-limit, and timeout codes survive the actual worker message interface.
8. An actual stopped/restarted worker retains settings, loses its memory cache,
   and caches its next result normally.

The first three scenarios were observed failing before their fixes and passing
afterward. Browser results stay in ignored `.preview/reliability-check/results.json`.
CI runs unit tests and the credential-free build. The Helium browser suite is a
separate local check. These checks prove controlled request behavior; they are
not a new live-provider latency benchmark or a production relay deployment test.
