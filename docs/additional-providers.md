# Additional translation candidates

Researched on 2026-10-02. The project prioritizes English to Ukrainian, short selections, low latency, a small extension, and a useful recurring free allowance. These are candidates for further measurement. Published token-generation speeds do not establish the time until a complete translation arrives.

The later [model research](benchmarks/2026-10-02/model-research.md) and [model comparison](benchmarks/2026-10-02/model-comparison-report.md) cover Gemini 3.5 Flash-Lite, Gemini 3.8 Flash, and five models through OpenCode Go. Go generation became available in that later run. Cerebras is now excluded at the user's request; its earlier setup notes below remain historical context.

## Researched shortlist

| Provider                               | Test target                                                                                        | Free access checked today                                                                                                                                                                                                       | Reason to test                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groq                                   | `qwen/qwen3.8-27b` with `reasoning_effort=none`, then `openai/gpt-oss-20b` at low reasoning effort | The listed Free plan limits for each are 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, and 200,000 tokens/day. The account dashboard is authoritative.                                                           | Groq lists 450 tokens/second for Qwen and 1,000 for GPT-OSS 20B. Measure Ukrainian quality, first visible translation, and full completion. Qwen is a preview model.                                                                                                                         |
| Cloudflare Workers AI                  | `@cf/meta/m2m100-1.2b`                                                                             | 10,000 neurons/day on Workers Free. M2M100 is absent from the list of models requiring paid billing. Its listed rate is 31,050 neurons per million input tokens and the same per million output tokens.                         | A traditional multilingual translation model, rather than a chat LLM. Meta lists Ukrainian among its supported languages. The REST API needs a source language, defaulting to English. Test long-input completeness and sentence splitting before treating it as a general popup translator. |
| Gemini Developer API through AI Studio | `gemini-3.1-flash-lite`                                                                            | Input and output are free within the model's free-tier limits. New accounts start on Free Tier; upgrading to paid is a separate billing/prepayment step. Google explicitly says Free Tier is available in eligible EEA regions. | Google describes this model as optimized for translation and high-volume tasks. This is separate from Google Cloud Translation, which remains skipped because its onboarding requested payment. Check actual account quotas in AI Studio instead of assuming an old requests/day limit.      |
| Cerebras                               | `qwen-3.8-27b` with `reasoning_effort=none`, matching Groq's Qwen3.8 model family                  | Current pricing offers a one-time $5 promotional credit after adding a payment method, expiring after 30 days. This is not a recurring free allowance.                                                                          | Its current chat API examples use this model. Authenticate and verify availability before benchmarking. Older indexed documentation still advertises a free tier, so onboarding and current pricing take precedence.                                                                         |

The initial shortlist prioritized Groq for LLM speed and Cloudflare for another traditional translation engine. The later authenticated tests exposed Cloudflare omissions and repetitions, ruling this model out as the default. An edge network alone does not establish inference latency. See the [measured comparison](benchmarks/2026-10-02/additional-cloud-report.md) before choosing a provider.

The Cloudflare M2M100 allowance corresponds to approximately 322,000 combined input/output tokens per day at its listed neuron rates, if this is the only model used. This is arithmetic from pricing, not a measured translation count. Ukrainian tokenization and other account usage affect the number of requests.

Gemini's pricing page marks Free Tier usage as eligible for product improvement. Check its applicable regional terms before translating private content. All benchmark inputs in this repository are synthetic.

Amazon Translate is another dedicated API supporting Ukrainian, but account provisioning, IAM credentials, and time-limited free access make it a lower priority here. Its pricing page advertises 2 million characters/month for 12 months, while AWS's current account documentation distinguishes free account credits lasting up to six months from paid-account short-term offers. Confirm the actual account offer before assuming a renewable free allowance.

## OpenCode Go experiment

The user has chosen direct cloud API requests for this project. No OpenCode CLI translation was started; the CLI was used only to list models during the earlier investigation. The two early API attempts below remain archived as rejected experiments. The later model comparison uses the direct model-listing and generation endpoints and includes successful Go translations.

Go has direct API endpoints and currently lists MiMo V2.6 Flash, GLM 5.3 Flash, and Qwen3.8 Flash. Its basic subscription costs $10/month; Go Plus costs $40/month. However, its documented client scope is coding agents sending typical coding-agent traffic. Treat this as an internal model experiment. Use a provider's normal API for a distributed translation extension, or obtain an explicit supported-use answer from OpenCode first.

The installed OpenCode CLI listed both tested model IDs. The local `opencode-go` credential was read only from the explicitly selected auth file, without copying it into the project or displaying it.

On 2026-10-02 at 19:53 UTC, direct requests to both `mimo-v2.6-flash` and `glm-5.3-flash` returned **HTTP 429**, with `GoUsageLimitError`, `Go usage limit exceeded`, and `limitName: 5 hour`. Neither generated translated text. Their roughly 0.6-second error responses are not translation timings. Further Go requests stopped after these two attempts.

The attempt also collected an Azure control: one initial request and 36 warm attempts, of which 35 succeeded. Azure then returned HTTP 429 and its requests stopped. This partial control is archived separately and does not replace the completed cloud comparison. The first version of the experimental runner continued the control after Go failed; the runner now skips that extra work if no Go model passes preflight.

Raw attempt: [go-195318/results.json](benchmarks/2026-10-02/go-195318/results.json). The earlier completed comparison remains [cloud-report.md](benchmarks/2026-10-02/cloud-report.md).

The reusable [Go runner](../scripts/benchmark-opencode-go.py) defaults to the 18-input corpus and three rounds. Each run sends one request at a time, without hidden retries, using persistent HTTP/1.1 connections. It reports first translated text separately from reasoning output and full completion. MiMo requests disable thinking. GLM uses `reasoning_effort=low`; the later live test found that Go rejects Z.ai's native `thinking` field, so that field is omitted for GLM. DeepSeek V4 requests also set `reasoning_effort=none`, because the native disable field alone did not prevent reasoning on that route. V4.1 returned no reasoning with the native disable setting. Qwen uses the documented Anthropic-compatible Messages endpoint. The later model report preserves both the original requests and the corrected configurations.

To repeat after the account's five-hour allowance becomes available:

```sh
python3 scripts/benchmark-opencode-go.py \
  --auth-file ~/.local/share/opencode/auth.json --check
python3 scripts/test_benchmark_opencode_go.py
python3 scripts/benchmark-opencode-go.py \
  --auth-file ~/.local/share/opencode/auth.json --models glm-5.3-flash,mimo-v2.6-flash \
  --with-azure --rounds 3
```

Alternatively set `OPENCODE_GO_API_KEY` in `.env` and omit `--auth-file`. Every run writes a new result file. The runner stops a variant on an authentication or quota rejection; it does not switch to separately billed Zen usage.

OpenCode also lists a temporary `mimo-v2.6-flash-free` model on the separate Zen endpoint. One explicit request to that published free model at 19:58 UTC returned **HTTP 403**, with `FreeTierError` and `OpenCode's free tier can only be used from within OpenCode`. The request used the benchmark's real user agent, without impersonating the OpenCode client. This free route does not support a standalone extension request under the tested configuration. No translation was generated and no further free-route calls were made. Raw response: [zen-free-195805/results.json](benchmarks/2026-10-02/zen-free-195805/results.json).

The runner's explicit `--route zen-free` option is confined to that published free MiMo model and rejects other model selections. It never falls back to a paid model. This option preserves the rejected experiment for reproduction; it is not a supported extension integration.

## Setup for the next comparison

The four direct HTTPS adapters are implemented in `benchmark-cloud.py`. Groq and Cerebras use their Chat Completions endpoints with thinking disabled, Gemini uses GenerateContent with minimal thinking, and Cloudflare uses its Workers AI REST translation endpoint. `.env.example` records the public endpoints and model defaults. Leave unused keys empty. On 2026-10-02, authenticated short translations succeeded with the newly configured Groq, Gemini, and Cloudflare keys. Cerebras remains optional and unconfigured. The [additional cloud report](benchmarks/2026-10-02/additional-cloud-report.md) records the repeated measurements and output checks.

- Groq: create a Free plan account at [Groq Console](https://console.groq.com/), open [API keys](https://console.groq.com/keys), and paste a key into `GROQ_API_KEY`. Remain on Free plan for this comparison.
- Cloudflare: open [Workers AI](https://dash.cloudflare.com/?to=/:account/ai) in the dashboard and select **Create a Workers AI API Token**. Use the prefilled token template scoped to the chosen account. If creating it manually, Cloudflare requires **Workers AI > Read** and **Workers AI > Edit**. Put it in `CLOUDFLARE_API_TOKEN`, and put the account ID in `CLOUDFLARE_ACCOUNT_ID`. A deployed Worker or custom domain is not required for the REST benchmark.
- Gemini: use [AI Studio API keys](https://aistudio.google.com/apikey), create a Free Tier project/key, and paste it into `GEMINI_API_KEY`. Keep Google Cloud Translation's separate key empty. This is optional; no billing setup is needed for the documented Free Tier.
- Cerebras: log in to [Cerebras Cloud](https://cloud.cerebras.ai/). Its [current trial terms](https://www.cerebras.ai/pricing) require a valid payment method for a one-time $5 credit lasting 30 days; Cerebras states that this does not charge the card or automatically enroll the account in paid usage. After activation, open **API Keys** in the left navigation, create a key, and paste it into `CEREBRAS_API_KEY`. The endpoint and `qwen-3.8-27b` default are already present in `.env`. Leave the key empty to skip this optional trial. No trial or paid usage was activated by the agent.

Create Groq and Cloudflare keys first. Gemini and Cerebras are optional. Keys belong in the local `.env`, not chat. The main runner does not read OpenCode credentials or run a coding-agent CLI.

Check credential presence and preview redacted request payloads without network calls:

```sh
python3 scripts/benchmark-cloud.py --check
python3 scripts/benchmark-cloud.py --dry-run --providers groq,cloudflare,gemini,cerebras
```

Authenticate with one short translation per selected variant, then run the shared realistic corpus:

```sh
python3 scripts/benchmark-cloud.py --smoke-only \
  --variants groq-qwen-stream,cloudflare-m2m100-en,gemini-flash-lite-stream,cerebras-qwen-stream
python3 scripts/benchmark-cloud.py \
  --inputs docs/benchmarks/inputs-realistic-en-uk.json --rounds 3 \
  --variants cloudflare-m2m100-en,gemini-flash-lite-stream,cerebras-qwen-stream
python3 scripts/benchmark-cloud.py \
  --inputs docs/benchmarks/inputs-groq-supported-en-uk.json --rounds 3 \
  --variants groq-qwen-stream --groq-output-tpm 1000
```

Only configured variants run. Cloudflare needs both its token and account ID. The LLM adapters also support complete-response variants, selected through `--providers` or their `*-complete` IDs. First streamed text excludes reasoning. The runner rejects LLM responses that end without the provider's normal completion reason. Cloudflare's long-text output must still be inspected for completeness because its translation response has no LLM finish reason.

Groq's public 8,000-token/minute allowance is not the only possible limit. The configured account rejected a request with a separate **1,000 output tokens/minute** limit. The runner now also paces that output budget, using returned completion-token usage and the next request's output ceiling. `--groq-output-tpm` defaults to 1,000; confirm the account's actual value in [Groq Limits](https://console.groq.com/settings/limits), including the input/output breakdown. If a response consumes more than a minute's allowance, its token debt is carried into the next request. The rejected run remains archived and is not silently retried.

Pacing did not make every input eligible. A later repeat of the 623-word input returned `Request too large`: its expected **1,383 output tokens** exceeded the enforced **1,000-token** limit. Earlier single large responses had succeeded, so one successful long request did not establish reliable access. A following shorter-text attempt exposed that the request's output ceiling still exceeded the limit. `GROQ_MAX_OUTPUT_TOKENS=1000` now caps the actual wire request as well as pacing the output budget; incomplete/token-limited generations are rejected rather than presented as successful translations.

The five-text supported subset excludes the approximately 600-word size and repeats the same word, short, sentence, paragraph, and approximately 270-word inputs three times. Its comparison uses exactly those inputs from the other providers. The rejected runs and their successful outputs remain archived; there is no complete three-repeat Groq result for the largest size. A higher output allowance or a separately measured chunking strategy would be needed to assess that size reliably.

Gemini defaults to 15 seconds between starts; adjust `--gemini-interval` to the project's actual limits. New providers stop on authentication, billing, or quota rejection rather than repeatedly trying an exhausted allowance. Deliberate pacing remains outside the measured request duration. Reports are archived in new timestamped paths.

Cloudflare M2M100 returned HTTP 200 and nonempty text while omitting substantial parts of long inputs. Some outputs also repeated unrelated text. Its response has no completion reason, so the runner's `ok` field indicates a nonempty API result, not verified translation completeness. Inspect the actual output before treating its latency as a complete translation measurement. The model's documented request schema does not expose an output-token limit to increase.

Use the existing short/long corpus and report success counts, HTTP errors, first-round timing, median, slower tail, and complete translations. Pace Azure by characters as well as requests to stay within its F0 throughput limit. LLM benchmarks should also record thinking settings and truncation, since a fast incomplete translation is not a successful result.

## Primary sources

- [Groq model catalog](https://console.groq.com/docs/models), [Free plan rate limits](https://console.groq.com/docs/rate-limits), [Qwen modes](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [billing](https://console.groq.com/docs/billing-faqs).
- [Cloudflare M2M100 API](https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/), [Workers AI pricing and paid-model exceptions](https://developers.cloudflare.com/workers-ai/platform/pricing/), [REST setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [Meta's model card and language list](https://huggingface.co/facebook/m2m100_1.2B).
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Free Tier and regional billing FAQ](https://ai.google.dev/gemini-api/docs/billing), [account-specific limits](https://ai.google.dev/gemini-api/docs/rate-limits).
- [Current Cerebras pricing](https://www.cerebras.ai/pricing), [key creation and API quickstart](https://inference-docs.cerebras.ai/quickstart).
- [Groq Chat Completions contract](https://console.groq.com/docs/api-reference#chat-create), [Cerebras Chat Completions and current Qwen model example](https://inference-docs.cerebras.ai/api-reference/chat-completions), [Gemini GenerateContent](https://ai.google.dev/api/generate-content), [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite).
- [OpenCode Go models, endpoints, intended traffic, and limits](https://opencode.ai/docs/go/), [GLM thinking requirements](https://docs.z.ai/guides/capabilities/thinking-mode).
- [OpenCode Zen free-model IDs, limited-time availability, and data use](https://opencode.ai/docs/zen/). The OpenCode-client restriction above comes from the recorded live API response.
- [Amazon Translate pricing](https://aws.amazon.com/translate/pricing/), [AWS account Free Tier rules](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html), [Amazon supported languages](https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html).
