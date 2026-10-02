# Translation options and prototype recommendation

Updated 2026-10-03. Measurements were collected on 2026-10-02, translating English to Ukrainian from an Apple M4 Pro / 48 GiB Mac.

## Working recommendation

**Use a dedicated translation API for the first prototype: Azure as the default, with DeepL as a selectable alternative.** The prototype now implements this choice. See the [setup and development guide](../README.md).

Azure best fits the priorities of fast complete translations, lightweight client code, and a useful recurring free allowance. DeepL is worth keeping because it handled our sampled idioms more naturally. Start its alternative route with `latency_optimized`; the tested speed and quality modes produced identical outputs on those idioms, while quality mode took longer on the realistic passages.

The choice is about the API contract as well as the model. A dedicated service accepts text and language parameters directly. A general LLM requires a translation prompt, generation settings, streamed-output handling, and completion checks. Providers can offer NMT and LLM translation behind the same service: Azure now supports both, but its default is standard NMT, and our tested requests did not select an LLM deployment. See the [Azure API overview](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/2026-06-06/overview).

## What our practical choices are

| Choice | Proposed role | Why consider it | Main limitation observed |
|---|---|---|---|
| Azure Translator, standard NMT | Default for the prototype | Fast completed results across the tested sizes; automatic source detection in the translation request | Some idiom wording was awkward |
| DeepL, latency optimized | Selectable alternative | More natural wording on our small idiom sample; completed the full realistic repeated corpus | Slower than Azure; the configured free allowance is finite |
| Groq, Qwen3.8 27B, reasoning off | Optional short-text streaming experiment | Fastest observed first text for the matched paragraph; competitive completion time | Account output limits prevented reliable repeated large-text tests |
| Gemini 3.5 Flash-Lite, minimal thinking | General LLM alternative if needed | All 18 selected warm requests completed, covering all six sizes | Slower complete translations than Azure and DeepL in the matched samples |
| Cohere North Small Translate | Translation-focused LLM alternative | Starts text quickly; natural handling of the sampled idioms | Long translations take much longer to finish; trial and production terms need to fit usage |
| OpenCode Go, DeepSeek V4 Flash, reasoning off | Recorded experiment | Strongest tested Go route across the text sizes after correcting reasoning settings | Slower completion than the dedicated APIs; Go is intended for coding-agent use rather than being our translation service |

North Small Translate is a purpose-built generative translation model, between the usual dedicated NMT service and a general chat model. Its [official documentation](https://docs.cohere.com/docs/north-small-translate-1.0) describes free-tier access and separate commercial terms. The working model ID in our account was `north-small-translate-09-2026`.

OpenCode Go's intended use and subscription limits are described in its [official documentation](https://opencode.ai/docs/go/). The Go benchmarks used direct cloud API requests, not CLI inference. Their results do not establish the speed of the same model through a different host.

## Comparable timings

Seconds, medians of three successful warm repeats of each identical source. The sentence has 21 words, the paragraph 90 words, and the large passage 623 words. Earlier and later providers ran in different batches; service load and provider caching were not controlled.

| Route | Sentence complete | Paragraph first text | Paragraph complete | Large passage complete |
|---|---:|---:|---:|---:|
| Azure, automatic source | 0.157 | 0.481, complete response | 0.481 | 0.398 |
| DeepL speed, automatic source | 0.242 | 0.758, complete response | 0.758 | 1.007 |
| DeepL quality, automatic source | 0.281 | 1.003, complete response | 1.003 | 1.315 |
| Groq Qwen3.8 27B | 0.261 | 0.064 | 0.444 | Not measured reliably |
| North Small Translate | 0.331 | 0.216 | 1.023 | 6.303 |
| Gemini 3.5 Flash-Lite | 0.641 | 0.677 | 1.199 | 3.884 |
| Go DeepSeek V4 Flash, reasoning off | 0.587 | 0.544 | 1.030 | 5.218 |

Azure and DeepL return complete responses on the tested routes; the other rows stream. Starting text quickly can make a popup feel responsive, but it does not mean the translation is finished. Groq shows that LLMs are not universally slower. Its paragraph completion was slightly faster than Azure's in these batches, while the account's 1,000-output-token restriction blocked the largest repeated request.

These are service-call timings, including network and response reading, not extension click-to-visible measurements. A longer passage being faster than a paragraph in one provider's sample is not a general rule. The small matched sample does not establish a stable latency ranking or independent translation-quality score.

The earlier dedicated-provider comparison covered 18 distinct texts, three at each of six sizes, repeated three times. Azure, both DeepL modes, and North completed all 54 warm requests per variant. The newer model comparison uses one source at each size, repeated three times. Both datasets remain available rather than treating their sample counts as interchangeable.

## Free usage and setup

- **Azure F0: 2 million characters per month.** This is the strongest recurring free allowance among our recommended routes. See [Azure Translator pricing](https://azure.microsoft.com/en-us/pricing/details/translator/).
- **DeepL API Developer: 1 million characters total, without a monthly reset.** It is useful for evaluation and initial personal use, but should not be treated as an ongoing monthly free budget. See [DeepL API plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans).
- LLM free tiers and subscription limits differ by account and model. Our actual quota failures are recorded in the reports; a successful benchmark does not guarantee an unlimited free production route.
- Google Cloud Translation and Cerebras remain skipped at the user's request because their onboarding did not fit the preferred setup. No speed result is claimed for either. Gemini's developer API was tested separately from Google Cloud Translation.

Provider credentials and setup instructions are in [api-keys.md](api-keys.md). Keys belong in the ignored `.env`, outside documentation and results.

## Other tested routes

- Gemini 3.8 Flash was slower than 3.5 Flash-Lite in our run and completed 14 of 18 warm attempts. High-demand errors and an account-specific daily limit were retained in the archive.
- Go GLM-5.3 Flash started the sentence slightly faster than Gemini 3.5 Flash-Lite, but its paragraph took 9.375 seconds to complete and all three large requests timed out. Raycast's Vercel route was not measured, so this is not a result for Raycast.
- Go DeepSeek V4.1 Flash, Qwen3.8 Flash, and MiMo-V2.6 Flash were slower than the corrected V4 route in the matched samples.
- Command R7B had translation errors and slow long-text completion. Cloudflare M2M100 omitted source content in at least 24 of 54 warm responses. MyMemory had weaker sampled idiom handling. None is recommended as the default from this evidence.

## First prototype scope

Build the Chromium extension around the requested interaction: select text, click the small translation button, and read the result in a larger popup. Default the target to Ukrainian and remember the last chosen target language. Use Azure automatic source detection in the same request, and expose DeepL as an alternative provider.

The popup opens immediately and populates when the translation arrives. A bounded in-memory cache reuses repeat selections, keyed by source text, target language, and provider. It clears when the background worker restarts. The benchmark deliberately used no local cache.

The next useful validation is the real Helium extension: measure click to visible translation, including worker startup, messaging, network, and rendering. Review Ukrainian outputs on actual reading selections as well. Those results should decide whether the default needs changing.

## Future ideas

Offline mode and a tiny open-weight browser LLM remain speculative, outside the first prototype. Their usefulness is unproven, and they may be dropped entirely. The discussion, local test evidence, and unanswered questions are saved in [future.md](future.md).

## Evidence

- [Local engines and original short-text results](benchmarks/2026-10-02/report.md)
- [Azure, DeepL, and Cohere comparison, including actual idiom outputs](benchmarks/2026-10-02/cloud-report.md)
- [Groq, earlier Gemini, and Cloudflare results and quota failures](benchmarks/2026-10-02/additional-cloud-report.md)
- [New Gemini and five OpenCode Go models](benchmarks/2026-10-02/model-comparison-report.md)
- [Model-size research and browser-LLM opinion](benchmarks/2026-10-02/model-research.md)
- [All dated runs and reproduction instructions](benchmarks/README.md)
