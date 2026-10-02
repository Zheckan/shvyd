# Translation benchmark, 2026-10-02

Local English-to-Ukrainian translation is very fast on this Mac. Chrome's built-in Translator API was the fastest completed local test. The portable Bergamot wrapper also ran successfully in Helium, but its large WebAssembly memory allocation and literal idiom translations limit its fit for a lightweight, high-quality extension.

This is an engine benchmark in headless browser pages, not a completed Chromium extension benchmark. API keys were not available, so Azure, DeepL, and Cohere have no measured latency in this report.

## Environment and method

- Apple M4 Pro, 48 GiB RAM, arm64 macOS.
- Helium 0.18.1.1, Chromium 154.0.8037.57; Google Chrome 150.0.7871.182.
- Isolated temporary browser profiles. The user's regular browser profiles were not used.
- Source `en`, target `uk`, 12 distinct inputs, five sequential rounds, 60 warm samples per successful engine.
- Time from JavaScript's translation call until complete output, measured with `performance.now()`.
- No selection UI, popup rendering, automatic language detection, extension messaging, or MV3 worker startup is included.
- Bergamot ran in a dedicated Web Worker. Its translation cache was disabled with `cacheSize: 0`; native Firefox IntGEMM was disabled.
- Bergamot assets came from a loopback HTTP server. The models had already downloaded, so its cold number excludes internet download time.
- The page's Content Security Policy limited its fetches and workers to the local server. Bergamot inference did not call a translation server.
- Chrome native model acquisition happened through the browser's component downloader. First creation includes that download and setup. Later translations use the local engine.
- Native internal caching could not be disabled. Full results include both first-round unique texts and subsequent repetitions. The first native round's 12 distinct inputs had a median of 3.45 ms.
- One Helium headless startup page reload interrupted the first attempt. The harness restarted after the page became ready; the complete 60-sample run is reported. Earlier incomplete harness runs are excluded.
- P95 uses nearest-rank, `sorted_values[ceil(0.95*n)-1]`. Median and P95 cover the mixed input-length set, so compare the same set in later runs.

## Measurements

All latency columns are milliseconds. Wasm heap size is allocated linear memory, not a measurement of physical RAM unique to the extension.

| Browser | Engine | Warm samples | Warm median | Warm P95 | Warm range | Cold setup / first result | Wasm heap |
|---|---|---:|---:|---:|---|---|---|
| Helium | Bergamot modern model | 60 | 11.40 | 62.20 | 3.30 to 64.40 | 358.50 | 522.625 MiB |
| Helium | Bergamot old model | 60 | 7.30 | 33.90 | 3.20 to 76.70 | 301.70 | 643.500 MiB |
| Helium | Native Translator API | 0 | Unmeasured | Unmeasured | Unmeasured | Create did not complete in 30,000 ms | Unmeasured |
| Chrome | Bergamot modern model | 60 | 12.05 | 60.50 | 3.00 to 62.40 | 420.20 | 522.625 MiB |
| Chrome | Bergamot old model | 60 | 7.20 | 31.90 | 2.70 to 34.60 | 284.70 | 643.500 MiB |
| Chrome | Native Translator API | 60 | 3.10 | 11.70 | 1.50 to 13.90 | Create including download: 4126.20 | Not isolated |

The modern model is Mozilla's English-to-Ukrainian version 3.0, architecture `base-memory`. It was loaded by npm package `@browsermt/bergamot-translator` version 0.4.9. The old model comes from the package's S3 registry. The package wrapper uses `workspace: 128` MiB and greedy decoding with `beam-size: 1`.

Firefox's current Remote Settings collection also publishes a newer Bergamot 0.6.0 runtime. That newer runtime was not benchmarked here. These memory numbers describe the tested wrapper, not every possible Bergamot implementation.

Bergamot's modern model, vocabulary, and shortlist total 23,778,709 compressed bytes, about 23.78 MB. They total 35,538,228 bytes after decompression. The tested engine's Wasm file adds 5,174,294 bytes, plus about 130 KB of JavaScript. These are download/storage sizes, separate from runtime memory.

Chrome installed 101,432,401 bytes of TranslateKit files, about 101.43 MB on disk, including the engine and both directions of the English/Ukrainian pair. Network transfer size was not measured. The fresh-profile create operation completed in 4,126.20 ms on this connection. A subsequent create without downloading was not separately measured.

Helium exposed `Translator` and returned `downloadable` for English-to-Ukrainian. However, `Translator.create` did not complete within the 30-second limit and no TranslateKit files appeared in the isolated profile. This is a bounded runtime failure to become ready, not proof that every Helium configuration must fail. Helium's current component-update allowlist excludes TranslateKit, which is consistent with this result.

## Input-length comparison

These are per-input medians across five repetitions. The Chrome column is its native Translator API; the Helium column is Bergamot with the modern model.

| Source text | Characters | Helium Bergamot ms | Chrome native ms |
|---|---:|---:|---:|
| bank | 4 | 3.90 | 1.70 |
| Open the settings. | 18 | 5.40 | 2.30 |
| Your changes have been saved. | 29 | 8.60 | 2.30 |
| I am feeling blue. | 18 | 8.00 | 2.80 |
| He eventually spilled the beans. | 32 | 12.70 | 3.30 |
| It costs an arm and a leg. | 26 | 10.10 | 2.20 |
| The river bank is steep. | 24 | 8.70 | 2.30 |
| Please restart your browser after the installation is complete. | 63 | 14.80 | 3.70 |
| The patch addresses a race condition in the background worker. | 62 | 17.40 | 4.10 |
| You can select a different language from the menu. Your choice will be remembered the next time you open the browser. | 117 | 31.80 | 7.10 |
| The update improves performance and fixes several bugs. Please restart your browser after the installation is complete. Your saved settings and bookmarks will remain available. | 176 | 38.90 | 6.90 |
| When you select text on a web page, a small translation button appears beside it. Click the button to see the translation without leaving the page. The tool remembers your last chosen language and keeps the interface simple. | 224 | 63.10 | 11.70 |

## Translation observations

This is a small synthetic check, not a formal quality ranking or an accuracy percentage. Straightforward UI prose generally produced readable Ukrainian. Idioms exposed clear weaknesses in both local engines:

| Input | Helium Bergamot modern | Chrome native |
|---|---|---|
| I am feeling blue. | Я відчуваю себе блакитним. | Я відчуваю себе блакитним. |
| He eventually spilled the beans. | Врешті-решт він розлив боби. | Зрештою він пролив квасолю. |
| It costs an arm and a leg. | Це коштує руки і ноги. | Це коштує руки і ноги. |

These literal translations miss the intended idiomatic meanings. The older Bergamot model also produced `Кошить руку і ногу.` for the third input. All outputs, including technical phrases, are saved in `results.json` for later comparison.

## Earlier cloud measurement from the same research session

MyMemory was tested earlier on this date using public synthetic text and Python HTTP/1.1, outside an extension.

| MyMemory test | Requests | Median ms | Range ms |
|---|---:|---:|---|
| Baseline, fresh connection each time | 24 | 689.50 | 449.20 to 1,177.10 |
| Paired probe, fresh connection | 10 | 768.55 | 470.80 to 1,028.30 |
| Paired probe, confirmed reused connection | 20 | 294.35 | 241.40 to 802.50 |

No requests failed. Repeated text may have benefited from provider caching. These inputs and runtime differ from the local benchmark, so this is context, not a controlled local-versus-cloud ranking. Raw earlier samples were retained in the original research tool session; this file preserves the verified aggregate statistics only. MyMemory also showed literal idiom errors and was not selected as the main translation provider.

Azure, DeepL, and Cohere remain pending API keys. Advertised latency is not an observed result.

## What this supports

Use Chrome's native engine as an optional fast path only after the language pair can actually be created. Checking for `Translator` or trusting `availability() === "downloadable"` alone is insufficient, as the Helium test demonstrates.

For Helium, compare Azure and DeepL directly once their keys are ready. The tested portable Bergamot wrapper is a possible offline mode, but the allocated heap and idiom quality do not support making it the default for a lightweight, high-quality tool yet. A newer engine, smaller workspace, source-language detection, Polish-to-Ukrainian routing, and MV3 integration all need separate tests.

## Evidence and future runs

`results.json` contains every local sample, its source text and output, cold measurements, available memory diagnostics, browser information, model hashes and URLs, and the earlier cloud aggregates. `harness/` contains the exact page, browser runner, and worker wrapper used by the final local test. Large model and runtime binaries remain in temporary scratch storage and are not added to the project.

The final runner was narrowed to Helium after Chrome had completed. The Chrome data comes from the same harness before that narrowing. To repeat both, restore Chrome to the browser list in `run_bench.py`. Rehydrate matching assets from the recorded URLs and verify their SHA-256 hashes. The existing scratch directory can be used immediately with `python3 run_bench.py`; it requires Python's already-installed `websocket-client` and `psutil` modules and the named browser executables. No dependencies were installed for this run.

For future comparisons, keep the source/target pair, input set, sample count, cache settings, cold-versus-warm definition, and metric calculation fixed. Record the OS, hardware, browser version, model and runtime versions, failures, first request with a new connection, and warm requests with a reused connection. Cloud credentials must stay in `.env`, outside results and documentation.

Primary references:

- [Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api)
- [Bergamot JavaScript wrapper and cache options](https://github.com/browsermt/bergamot-translator/blob/main/wasm/module/README.md)
- [Mozilla translation models](https://github.com/mozilla/translations)
- [Mozilla model records](https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models-v2/records)
- [Mozilla runtime records](https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-wasm/records)
- [Helium component-update allowlist](https://github.com/imputnet/helium/blob/main/patches/helium/core/component-updates.patch)
