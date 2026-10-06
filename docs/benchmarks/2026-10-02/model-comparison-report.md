# Fast-model translation comparison, 2026-10-02

**Gemini 3.5 Flash-Lite and OpenCode Go DeepSeek V4 Flash with reasoning off are the strongest new candidates in this run.** GLM-5.3 Flash had a slightly faster first text for the sentence, but was much slower and less reliable on long passages. Gemini 3.8 Flash was slower than Lite under the service conditions observed and returned high-demand failures.

The earlier Gemini test used **gemini-3.1-flash-lite**, not 3.8. This report adds two current Gemini models and five OpenCode Go models through direct API requests. Cerebras is excluded at the user's request. No coding-agent CLI performed translation. Model sizes, provider research, and the browser-model opinion are saved separately in [model-research.md](model-research.md).

## What was measured

- English to Ukrainian on the same Apple M4 Pro / 48 GiB machine and network as the earlier tests.
- Six distinct synthetic source texts: word / 4 characters, short / 18, sentence / 117, paragraph / 523 / 90 words, long / 1,694 / 270 words, and large / 4,023 / 623 words.
- Each selected model attempted all six sources three times: 18 warm requests per model, 126 selected warm attempts across seven model routes. There were 119 normal completions. This is one distinct source per size, not three different sources per size as in the earlier full corpus.
- Persistent HTTP/1.1 connections, no local translation cache, no hidden retries. Each runner sends one request at a time. Gemini and the initial Go batches overlapped in time; GLM ran in a separate overlapping Go batch. The corrected DeepSeek V4 and Qwen batch began after the other Go repeated batches finished. These are exploratory measurements, not an isolated provider-load experiment.
- First text is the first nonempty translated text delta observed by the client; reasoning deltas do not count. It measures the API route's delivery of text, not a provider's internal time to first token or the extension's click-to-visible latency. Output streaming and buffering differ between routes.
- Latencies below include network and response reading. Quota pacing is excluded. Provider prompt caching and service load remain uncontrolled. Repeated identical inputs may benefit from server-side caching.
- All latency statistics exclude failed generations. Partial output remains archived. HTTP 200 alone is insufficient: the provider's normal completion reason must be present.
- Three repeats per source are enough to expose major differences and failures, but not to establish a stable tail-latency distribution. P95 in the JSON is the observed maximum when three completions are available.

## Full translation median, seconds

| Model / route | Word | Short | Sentence | Paragraph | Long | Large |
|---|---:|---:|---:|---:|---:|---:|
| Gemini 3.5 Flash-Lite | 0.496 | 0.625 | 0.641 | 1.199 | 1.909 | 3.884 |
| Gemini 3.8 Flash | 5.640 | 4.093 | 5.686 | 4.254 | 4.003 | 5.130 |
| Go GLM-5.3 Flash | 0.889 | 0.848 | 0.596 | 9.375 | 19.132 | No completion |
| Go DeepSeek V4 Flash, reasoning off | 0.546 | 0.576 | 0.587 | 1.030 | 2.174 | 5.218 |
| Go DeepSeek V4.1 Flash | 1.388 | 1.441 | 1.488 | 2.365 | 4.867 | 10.206 |
| Go MiMo-V2.6 Flash | 2.202 | 1.626 | 2.205 | 7.255 | 13.243 | 56.891 |
| Go Qwen3.8 Flash | 1.222 | 1.283 | 1.650 | 4.400 | 9.281 | 18.079 |

## First translated text median, seconds

| Model / route | Word | Short | Sentence | Paragraph | Long | Large |
|---|---:|---:|---:|---:|---:|---:|
| Gemini 3.5 Flash-Lite | 0.490 | 0.585 | 0.544 | 0.677 | 0.547 | 0.626 |
| Gemini 3.8 Flash | 5.632 | 4.081 | 5.671 | 4.242 | 3.768 | 2.108 |
| Go GLM-5.3 Flash | 0.884 | 0.802 | 0.437 | 1.617 | 0.632 | No completion |
| Go DeepSeek V4 Flash, reasoning off | 0.546 | 0.559 | 0.511 | 0.544 | 0.496 | 0.513 |
| Go DeepSeek V4.1 Flash | 1.384 | 1.410 | 1.297 | 1.129 | 1.391 | 1.134 |
| Go MiMo-V2.6 Flash | 2.089 | 1.244 | 1.169 | 3.441 | 1.899 | 3.733 |
| Go Qwen3.8 Flash | 1.167 | 1.126 | 1.206 | 1.521 | 1.685 | 1.325 |

The tables use successful complete generations. Gemini 3.8's sentence and large cells each contain two successes instead of three. GLM generated partial text in two large requests, but none completed; those partial first-text timings are excluded from the success table.

## Completion counts

| Model / route | Warm complete / attempts | Initial complete / attempts | Fresh complete / attempts |
|---|---:|---:|---:|
| Gemini 3.5 Flash-Lite | 18 / 18 | 1 / 1 | 3 / 3 |
| Gemini 3.8 Flash | 14 / 18 | 1 / 1 | 2 / 3 |
| Go GLM-5.3 Flash | 15 / 18 | 1 / 1 | 0 / 0 |
| Go DeepSeek V4 Flash, reasoning off | 18 / 18 | 1 / 1 | 0 / 0 |
| Go DeepSeek V4.1 Flash | 18 / 18 | 1 / 1 | 0 / 0 |
| Go MiMo-V2.6 Flash | 18 / 18 | 1 / 1 | 0 / 0 |
| Go Qwen3.8 Flash | 18 / 18 | 1 / 1 | 0 / 0 |

No additional fresh-connection series was run for Go. Its initial request was the 90-word paragraph and is separate from warm statistics. The initial GLM request with the rejected native thinking field is kept in the first Go archive and does not appear as a completed GLM measurement above.

Gemini 3.8's four warm failures were all high-demand errors: two HTTP 503 responses and two HTTP-200 streams that later ended with a 503 error and partial translation. Its final fresh request returned HTTP 429. The error explicitly reports **20 requests per day per project per model on this account's free tier**. It does not establish the free limit for 3.5 Flash-Lite or a paid project. All 18 warm and all three fresh Lite requests completed.

GLM's three large requests failed with timeouts. One failed after about 30 seconds without visible output; two exceeded the 90-second total-duration guard after generating partial translation. A stream that starts quickly but never completes is not a successful translation.

## Request settings and route corrections

- Gemini 3.5 Flash-Lite: temperature 0, thinkingLevel=MINIMAL. Gemini 3.8 Flash: temperature 0, thinkingLevel=LOW, its lowest supported level. Both use GenerateContent streaming. Google does not support MINIMAL on 3.8 Flash.
- GLM-5.3 Flash: temperature 0, reasoning_effort=low, 4,096 output-token request ceiling. OpenCode's current GLM upstream rejected Z.ai's native thinking field with HTTP 400 and unknown_parameter. Removing that field allowed generation. Z.ai documents the underlying model as always using thinking; Go may normalize parameters differently from the native API.
- MiMo-V2.6 Flash: thinking.type=disabled, temperature 0, max_tokens=4096. No reasoning deltas were returned, but the 623-word passage still took a median 56.9 seconds to finish on this route.
- DeepSeek V4.1 Flash: thinking.type=disabled, temperature 0, max_tokens=4096. No reasoning deltas were returned in the selected run.
- Qwen3.8 Flash: Anthropic-compatible /zen/go/v1/messages, thinking.type=disabled, temperature 0, max_tokens=4096. No reasoning deltas were returned. This commercial Flash ID differs from Groq's Qwen3.8 27B.
- DeepSeek V4 Flash needed **reasoning_effort=none** in addition to the native disable field. The original disable-only run still returned reasoning in its paragraph and long generations. It even reported more completion tokens than the requested 4,096-token ceiling in large responses, so accepted JSON fields cannot be assumed to be honored by the gateway. After adding the standard effort setting, all 18 repeated requests returned no reasoning deltas and completed normally.

For the identical 623-word source, V4's disable-only median was 36.1 seconds until translated text and 38.9 seconds to completion. The corrected batch measured 0.513 seconds until text and 5.218 seconds to completion. The later batch also has different provider-load and cache conditions, so this is not a perfectly isolated causal estimate. Returned reasoning disappearing is direct evidence that the changed request setting affected behavior.

## Context from the earlier providers

These rows select exactly the same source IDs and three repeats from earlier completed batches. They were collected earlier in the evening, not simultaneously with the new models.

| Earlier route | Sentence complete s | Paragraph complete s | 623-word complete s |
|---|---:|---:|---:|
| Azure auto | 0.157 | 0.481 | 0.398 |
| Groq Qwen3.8 27B | 0.261 | 0.444 | Not measured |
| Gemini 3.1 Flash-Lite | 0.832 | 1.798 | 4.662 |

Azure returns the completed response without streaming. Groq's largest repeated request was rejected by its account's output allowance, so there is no comparable large row. The original dedicated-translation report and additional-provider report remain preserved.

Azure still looks strongest for the project's goal of quickly receiving a completed translation. DeepSeek V4 on Go is the strongest new Go candidate across these sizes after the request correction. GLM's 0.437-second sentence first text supports the user's observation that it can feel faster to start than a Gemini route, but its paragraph and large-passage behavior does not support using this Go route as the general default. Raycast's Vercel route has not been measured and may behave differently.

This study measures latency and normal completion, not independent translation accuracy. Actual outputs are retained for Ukrainian review. Successful STOP/end_turn responses do not certify that every nuance or sentence was translated correctly. Only English to Ukrainian was tested here.

## Archive and reproduction

The new generation archive contains **161 timed attempts and 9 failures**, including the original incompatible GLM request, disable-only DeepSeek diagnostics, and the two readiness checks. The 126 selected warm attempts above are a subset, and their 7 failures remain in the completion counts.

- [Current Gemini repeats and fresh checks](cloud-212815/results.json).
- [Initial four-model Go batch, including the rejected GLM field and DeepSeek disable-only behavior](go-212940/results.json).
- [Corrected GLM repeated batch](go-213015/results.json).
- [Qwen and corrected DeepSeek readiness checks](go-213626/results.json).
- [Qwen and corrected DeepSeek repeated batch](go-213754/results.json).
- [Machine-readable comparison, source hashes, settings, per-size medians/P95, and failure details](model-comparison-summary.json).
- [Official model catalog discovery](model-discovery-212211/catalog.json).

```sh
python3 -m unittest scripts.test_benchmark_cloud scripts.test_benchmark_opencode_go
python3 scripts/benchmark-cloud.py --dry-run \
  --variants gemini-3.5-flash-lite-stream,gemini-3.8-flash-stream
python3 scripts/benchmark-cloud.py \
  --variants gemini-3.5-flash-lite-stream,gemini-3.8-flash-stream \
  --inputs docs/benchmarks/inputs-groq-paced-en-uk.json --rounds 3 --gemini-interval 15
python3 scripts/benchmark-opencode-go.py \
  --auth-file ~/.local/share/opencode/auth.json --dry-run \
  --models glm-5.3-flash,mimo-v2.6-flash,deepseek-v4-flash,deepseek-v4.1-flash,qwen3.8-flash
python3 scripts/benchmark-opencode-go.py \
  --auth-file ~/.local/share/opencode/auth.json \
  --models glm-5.3-flash,mimo-v2.6-flash,deepseek-v4-flash,deepseek-v4.1-flash,qwen3.8-flash \
  --inputs docs/benchmarks/inputs-groq-paced-en-uk.json --rounds 3
```

These commands create new timestamped raw archives. The current runner uses corrected Go settings, so it will not reproduce the incompatible GLM field or V4's disable-only diagnostic. Leave cloud keys in the ignored .env file. The optional selected OpenCode Go key remains in its existing auth file. No key was copied into the report or project environment.

The [primary-source research](model-research.md) records model-size evidence, supported thinking levels, API routes, and the opinion on a tiny browser model. No browser LLM was downloaded or tested.
