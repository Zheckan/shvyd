# Cloud translation benchmark, 2026-10-02

This report compares the configured translation services on the same Mac used for the earlier local benchmark. The core set covers the same 12 short texts as the local engines. The realistic set adds 18 texts from one word to roughly 600 words, with three texts at each size and three rounds per text.

## Environment and method

- Apple M4 Pro, 48 GiB RAM, arm64 macOS; requests originate from this machine on its current network.
- English to Ukrainian. Azure and DeepL compare explicit English with automatic source detection; the realistic selection workflow uses automatic detection.
- Python standard-library HTTPS client, HTTP/1.1. Time starts before sending the request and ends after reading and decoding the entire response. No local translation cache and no hidden retries.
- One request at a time in each run. Providers and inputs are shuffled with seed 42. The final paced DeepL run and the other benchmark runs execute sequentially.
- Warm requests reuse the variant's connection. Connection reuse is recorded for each request. First and representative fresh-connection requests are retained separately in the raw JSON.
- Provider caching cannot be disabled. First-round numbers are included separately; warmed model state and repeated-text caches may affect later rounds. The first-round seed text also appears in the initial readiness request.
- DeepL's initial burst run was rate limited. Later runs space DeepL requests at least two seconds apart. Cohere starts are spaced at least 3.2 seconds apart. These deliberate waits are outside the measured request latency.
- Failed requests, incomplete generations, and parser failures are counted as failures and excluded from successful latency percentiles.
- LLMs use temperature 0, a translation-only prompt, and an output-token ceiling that grows with source length, capped at 4,000 tokens. Streaming captures the first nonempty text delta and the full completed message.
- P95 uses nearest rank. Each realistic size has nine planned warm requests, so its P95 is the slowest successful request in that small group. Treat tail numbers as observations from this run.
- Size groups contain different content. Their timing differences combine input length, content, provider state, and network variability; the results are not guaranteed to increase monotonically with text length.
- These are service benchmarks. Browser HTTP/2 or HTTP/3, extension messaging, worker wake-up, popup layout, and complete click-to-visible latency are not measured.

## Core set, same inputs as the local benchmark

All timing columns are milliseconds. The later paced DeepL repeats use three rounds; Azure and complete-response Cohere use five rounds. Counts are shown explicitly.

| Variant | Success / attempts | Median | P95 | First-round median | Source |
|---|---:|---:|---:|---:|---|
| Azure, English source | 60 / 60 | 60.17 | 246.85 | 106.11 | [Raw](cloud-190653/results.json) |
| Azure, automatic source | 60 / 60 | 64.55 | 202.44 | 114.93 | [Raw](cloud-190653/results.json) |
| North Small Translate, complete | 60 / 60 | 271.74 | 528.30 | 269.40 | [Raw](cloud-190653/results.json) |
| Command R7B, complete | 59 / 60 | 376.12 | 1172.21 | 383.19 | [Raw](cloud-190653/results.json) |
| DeepL speed, English source | 36 / 36 | 218.42 | 517.48 | 220.80 | [Raw](cloud-192559/results.json) |
| DeepL speed, automatic source | 35 / 36 | 219.47 | 641.06 | 187.21 | [Raw](cloud-192559/results.json) |
| DeepL quality, English source | 35 / 36 | 213.42 | 485.39 | 214.37 | [Raw](cloud-192559/results.json) |
| DeepL quality, automatic source | 36 / 36 | 212.71 | 541.62 | 241.27 | [Raw](cloud-192559/results.json) |

## Realistic text sizes

| Size | Characters per text | Words per text | Distinct texts | Rounds |
|---|---:|---:|---:|---:|
| word | 4 to 5 | 1 to 1 | 3 | 3 |
| short | 18 to 63 | 3 to 9 | 3 | 3 |
| sentence | 117 to 168 | 21 to 36 | 3 | 3 |
| paragraph | 523 to 586 | 86 to 99 | 3 | 3 |
| long | 1489 to 1694 | 234 to 270 | 3 | 3 |
| large | 3724 to 4023 | 575 to 623 | 3 | 3 |

### Full translation median, milliseconds

| Size | Azure, automatic source | North Small Translate, streamed | Command R7B, streamed | DeepL speed, automatic source | DeepL quality, automatic source |
|---|---:|---:|---:|---:|---:|
| word | 49.35 | 225.46 | 272.62 | 154.48 | 175.92 |
| short | 49.05 | 270.86 | 363.39 | 172.89 | 165.56 |
| sentence | 170.07 | 457.18 | 859.49 | 390.31 | 408.37 |
| paragraph | 481.39 | 1028.37 | 2266.55 | 738.72 | 941.61 |
| long | 362.94 | 2389.95 | 5695.93 | 888.43 | 928.52 |
| large | 398.12 | 5545.78 | 14436.87 | 1007.41 | 1247.47 |

### Full translation P95, milliseconds

| Size | Azure, automatic source | North Small Translate, streamed | Command R7B, streamed | DeepL speed, automatic source | DeepL quality, automatic source |
|---|---:|---:|---:|---:|---:|
| word | 155.62 | 240.14 | 436.38 | 195.39 | 191.57 |
| short | 221.85 | 316.12 | 463.35 | 254.97 | 257.73 |
| sentence | 279.57 | 523.73 | 1098.81 | 516.35 | 486.94 |
| paragraph | 1130.36 | 1110.80 | 2963.97 | 957.80 | 1051.58 |
| long | 481.56 | 2725.99 | 6259.92 | 1055.10 | 1299.01 |
| large | 1441.37 | 6409.28 | 16950.65 | 1227.26 | 1379.11 |

### First streamed text median, milliseconds

| Size | North Small Translate, streamed | Command R7B, streamed |
|---|---:|---:|
| word | 210.27 | 234.98 |
| short | 215.92 | 235.37 |
| sentence | 211.40 | 236.99 |
| paragraph | 216.22 | 236.92 |
| long | 214.37 | 246.42 |
| large | 243.20 | 247.74 |

### First-round full translation median, milliseconds

Each cell uses the first three distinct texts at that size. Later repetitions are omitted from this table. Provider-side state and caches remain uncontrolled.

| Size | Azure, automatic source | North Small Translate, streamed | Command R7B, streamed | DeepL speed, automatic source | DeepL quality, automatic source |
|---|---:|---:|---:|---:|---:|
| word | 49.35 | 222.70 | 268.42 | 164.64 | 181.43 |
| short | 48.51 | 272.18 | 426.22 | 188.53 | 165.56 |
| sentence | 215.43 | 488.96 | 859.49 | 345.33 | 390.30 |
| paragraph | 533.99 | 1084.35 | 2266.55 | 611.43 | 905.64 |
| long | 363.31 | 2464.30 | 5695.93 | 915.65 | 969.24 |
| large | 434.61 | 5545.78 | 14172.57 | 997.51 | 1247.47 |

### Realistic request counts

| Variant | Successful / attempted warm requests | Source |
|---|---:|---|
| Azure, automatic source | 54 / 54 | [Raw](cloud-191659/results.json) |
| North Small Translate, streamed | 54 / 54 | [Raw](cloud-191659/results.json) |
| Command R7B, streamed | 54 / 54 | [Raw](cloud-191659/results.json) |
| DeepL speed, automatic source | 54 / 54 | [Raw](cloud-193118/results.json) |
| DeepL quality, automatic source | 54 / 54 | [Raw](cloud-193118/results.json) |

## Translation examples

These are actual outputs from the core run, selected to expose ambiguity and idioms. They are a small qualitative sample, not an independent accuracy score. Repeated outputs and complete long translations remain in the raw JSON.

| Source | Azure, automatic source | DeepL speed, automatic source | DeepL quality, automatic source | North Small Translate, complete | Command R7B, complete |
|---|---|---|---|---|---|
| bank | Банк | банк | банк | банк | банк |
| I am feeling blue. | Я почуваюся сумною. | Мені сумно. | Мені сумно. | Я відчуваю себе пригніченим. | Я відчуваю себе погано. |
| He eventually spilled the beans. | Зрештою він розкрив секрет. | Зрештою він все видав. | Зрештою він все видав. | Зрештою він розкрив усю правду. | Він, нарешті, розказав все. |
| It costs an arm and a leg. | Це коштує цілу плату. | Це коштує ціле багатство. | Це коштує ціле багатство. | Це коштує цілий статок. | Воно коштує ногу і руку. |
| The river bank is steep. | Берег річки крутий. | Берег річки крутий. | Берег річки крутий. | Берег річки стрімкий. | Банк річки стрімкий. |

## Setup and failures retained

- DeepL initially rejected the pasted credential on both official hosts. A canonical key was found with one extra copied character around it. That corrected value authenticated at `api-free.deepl.com` before `.env` was updated. The account initially reported zero usage and a 1,000,000-character allowance.
- Cohere's documented `north-small-translate-1-0` returned HTTP 404. The authenticated model list exposed `north-small-translate-09-2026`, which worked and is used in the benchmark. Command R7B uses `command-r7b-12-2024`.
- The first streaming parser did not accept the final `[DONE]` marker. Its two failed readiness measurements are retained, excluded from latency comparisons, and followed by corrected streaming runs. A regression test covers this case.
- An early all-blocked setup run stopped before producing timed samples. The fixed runner produces an empty report without crashing when no credentials are available.

- [cloud-190653](cloud-190653/results.json): completed, 258 timed attempts, 3 failures. Raw results are preserved.
- [cloud-190949](cloud-190949/results.json): incomplete setup run, 0 timed attempts, 0 failures. Raw results are preserved.
- [cloud-191636](cloud-191636/results.json): completed, 134 timed attempts, 60 failures. Raw results are preserved.
- [cloud-191659](cloud-191659/results.json): completed, 174 timed attempts, 0 failures. Raw results are preserved.
- [cloud-192559](cloud-192559/results.json): completed, 160 timed attempts, 2 failures. Raw results are preserved.
- [cloud-193118](cloud-193118/results.json): completed, 116 timed attempts, 0 failures. Raw results are preserved.

The selected comparisons contain 651 successful warm translations from 654 attempts. All preserved runs together contain 842 timed translation attempts, including setup and burst failures.

The [DeepL usage audit](cloud-usage.json) reports 134,668 characters used from a 1,000,000-character allowance, with 865,332 remaining. The successful recorded responses' billed-character total matches that usage.

## Interpretation for the prototype

The measured English-to-Ukrainian results support trying Azure as the first provider for a fast Helium prototype. The extension can store the target language locally and ask Azure to detect the source in the same translation request. This is a provider choice to verify in the extension, not a measured click-to-visible result.

DeepL handled the tested idioms more naturally than Azure, and its speed and quality modes produced the same idiom outputs in this small sample. Use the size tables to judge its latency cost. The burst test also shows that the free endpoint needs sensible pacing and explicit rate-limit handling.

North Small Translate starts streaming text quickly, but generating a complete long passage takes substantially longer than a dedicated translation request. Command R7B was slower on long passages and made observable errors, including a literal river-bank translation and untranslated English words such as `deserve` and `repeatedly` in a long passage. These observations do not constitute a formal accuracy benchmark.

## Google and local engines

Google Cloud Translation Basic v2 is implemented in the runner and has an optional `.env` section. It is the traditional NMT API. The user chose to skip Google after the account setup requested a payment. No Google account or billing changes were made by the agent, and no Google cloud latency is claimed. Setup documentation remains available in [API keys](../../api-keys.md) if this decision changes.

The earlier [local report](../2026-10-02/report.md) used the same core source set. Chrome native translation had a 3.10 ms warm median, while portable Bergamot with the modern model in Helium had 11.40 ms. Those engine-only timings exclude network and popup UI. Helium's native Translator did not complete creation within 30 seconds, and the tested Bergamot wrapper allocated a 522.625 MiB Wasm heap. Local idiom outputs were often literal.

## Reproduce

```sh
python3 scripts/test_benchmark_cloud.py
python3 scripts/benchmark-cloud.py --check
python3 scripts/benchmark-cloud.py --inputs docs/benchmarks/inputs-realistic-en-uk.json --rounds 3
python3 scripts/report-cloud.py
```

Every benchmark run creates a new result path. `.env` remains ignored by Git and has permissions 0600. The credential-free template is `.env.example`. The [machine-readable summary](cloud-summary.json) links each selected measurement to its source run.

## Primary references

- [Azure Translator API 2026-06-06](https://devblogs.microsoft.com/foundry/azure-translator-api-version-2026-06-06-ga-supporting-multilingual-applications-with-flexible-translation-options/)
- [DeepL translation parameters](https://developers.deepl.com/api-reference/translate/request-translation)
- [DeepL HTTP 429 errors](https://support.deepl.com/hc/en-us/articles/9773964275868-DeepL-API-error-messages)
- [North Small Translate](https://docs.cohere.com/docs/north-small-translate-1.0), [Cohere model discovery](https://docs.cohere.com/reference/list-models), [streaming format](https://docs.cohere.com/reference/chat-stream)
- [Google Basic v2 translation](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate), [API-key authentication](https://docs.cloud.google.com/translate/docs/authentication#api-keys)
