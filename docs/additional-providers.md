# Additional translation candidates

Researched on 2026-10-02. The project prioritizes English to Ukrainian, short selections, low latency, a small extension, and a useful recurring free allowance. These are candidates for further measurement. Published token-generation speeds do not establish the time until a complete translation arrives.

## Next providers to test

| Provider | Test target | Free access checked today | Reason to test |
| --- | --- | --- | --- |
| Groq | `qwen/qwen3.8-27b` with `reasoning_effort=none`, then `openai/gpt-oss-20b` at low reasoning effort | The listed Free plan limits for each are 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, and 200,000 tokens/day. The account dashboard is authoritative. | Groq lists 450 tokens/second for Qwen and 1,000 for GPT-OSS 20B. Measure Ukrainian quality, first visible translation, and full completion. Qwen is a preview model. |
| Cloudflare Workers AI | `@cf/meta/m2m100-1.2b` | 10,000 neurons/day on Workers Free. M2M100 is absent from the list of models requiring paid billing. Its listed rate is 31,050 neurons per million input tokens and the same per million output tokens. | A traditional multilingual translation model, rather than a chat LLM. Meta lists Ukrainian among its supported languages. The REST API needs a source language, defaulting to English. Test long-input completeness and sentence splitting before treating it as a general popup translator. |
| Gemini Developer API through AI Studio | `gemini-3.1-flash-lite` | Input and output are free within the model's free-tier limits. New accounts start on Free Tier; upgrading to paid is a separate billing/prepayment step. Google explicitly says Free Tier is available in eligible EEA regions. | Google describes this model as optimized for translation and high-volume tasks. This is separate from Google Cloud Translation, which remains skipped because its onboarding requested payment. Check actual account quotas in AI Studio instead of assuming an old requests/day limit. |
| Cerebras | A currently available multilingual model, verified against the authenticated model list | Current pricing offers a one-time $5 promotional credit after adding a payment method, expiring after 30 days. This is not a recurring free allowance. | Worth a speed experiment if card verification is acceptable. Older indexed documentation still advertises a free tier, so onboarding and current pricing take precedence. |

Groq is the first recommendation for another LLM speed comparison. Cloudflare is the first recommendation for another traditional translation engine. An edge network alone does not prove that translation inference runs near the user or that latency will beat Azure.

The Cloudflare M2M100 allowance corresponds to approximately 322,000 combined input/output tokens per day at its listed neuron rates, if this is the only model used. This is arithmetic from pricing, not a measured translation count. Ukrainian tokenization and other account usage affect the number of requests.

Gemini's pricing page marks Free Tier usage as eligible for product improvement. Check its applicable regional terms before translating private content. All benchmark inputs in this repository are synthetic.

Amazon Translate is another dedicated API supporting Ukrainian, but account provisioning, IAM credentials, and time-limited free access make it a lower priority here. Its pricing page advertises 2 million characters/month for 12 months, while AWS's current account documentation distinguishes free account credits lasting up to six months from paid-account short-term offers. Confirm the actual account offer before assuming a renewable free allowance.

## OpenCode Go experiment

Go has direct API endpoints and currently lists MiMo V2.6 Flash, GLM 5.3 Flash, and Qwen3.8 Flash. Its basic subscription costs $10/month; Go Plus costs $40/month. However, its documented client scope is coding agents sending typical coding-agent traffic. Treat this as an internal model experiment. Use a provider's normal API for a distributed translation extension, or obtain an explicit supported-use answer from OpenCode first.

The installed OpenCode CLI listed both tested model IDs. The local `opencode-go` credential was read only from the explicitly selected auth file, without copying it into the project or displaying it.

On 2026-10-02 at 19:53 UTC, direct requests to both `mimo-v2.6-flash` and `glm-5.3-flash` returned **HTTP 429**, with `GoUsageLimitError`, `Go usage limit exceeded`, and `limitName: 5 hour`. Neither generated translated text. Their roughly 0.6-second error responses are not translation timings. Further Go requests stopped after these two attempts.

The attempt also collected an Azure control: one initial request and 36 warm attempts, of which 35 succeeded. Azure then returned HTTP 429 and its requests stopped. This partial control is archived separately and does not replace the completed cloud comparison. The first version of the experimental runner continued the control after Go failed; the runner now skips that extra work if no Go model passes preflight.

Raw attempt: [go-195318/results.json](benchmarks/2026-10-02/go-195318/results.json). The earlier completed comparison remains [cloud-report.md](benchmarks/2026-10-02/cloud-report.md).

The reusable [Go runner](../scripts/benchmark-opencode-go.py) uses the same 18-input corpus, three rounds, one request at a time, no hidden retries, and persistent HTTP/1.1 connections. It reports first visible translation separately from reasoning output and full completion. MiMo requests disable thinking. GLM 5.3 Flash requires thinking, so requests enable it with `reasoning_effort=low`. Those request settings have not been authenticated by successful generation yet because quota rejection happened first.

To repeat after the account's five-hour allowance becomes available:

```sh
python3 scripts/benchmark-opencode-go.py \
  --auth-file ~/.local/share/opencode/auth.json --check
python3 scripts/test_benchmark_opencode_go.py
python3 scripts/benchmark-opencode-go.py \
  --auth-file ~/.local/share/opencode/auth.json --with-azure --rounds 3
```

Alternatively set `OPENCODE_GO_API_KEY` in `.env` and omit `--auth-file`. Every run writes a new result file. The runner stops a variant on an authentication or quota rejection; it does not switch to separately billed Zen usage.

OpenCode also lists a temporary `mimo-v2.6-flash-free` model on the separate Zen endpoint. One explicit request to that published free model at 19:58 UTC returned **HTTP 403**, with `FreeTierError` and `OpenCode's free tier can only be used from within OpenCode`. The request used the benchmark's real user agent, without impersonating the OpenCode client. This free route does not support a standalone extension request under the tested configuration. No translation was generated and no further free-route calls were made. Raw response: [zen-free-195805/results.json](benchmarks/2026-10-02/zen-free-195805/results.json).

The runner's explicit `--route zen-free` option is confined to that published free MiMo model and rejects other model selections. It never falls back to a paid model. This option preserves the rejected experiment for reproduction; it is not a supported extension integration.

## Setup for the next comparison

The new `.env` sections are placeholders. Groq, Cloudflare, Gemini, and Cerebras are not yet implemented in `benchmark-cloud.py`; setting their keys alone will not run them. The Go experiment has its separate runner above.

- Groq: create a Free plan account at [Groq Console](https://console.groq.com/), open [API keys](https://console.groq.com/keys), and paste a key into `GROQ_API_KEY`. Remain on Free plan for this comparison.
- Cloudflare: open [Workers AI](https://dash.cloudflare.com/?to=/:account/ai) in the dashboard and select **Create a Workers AI API Token**. Use the prefilled token template scoped to the chosen account. If creating it manually, Cloudflare requires **Workers AI > Read** and **Workers AI > Edit**. Put it in `CLOUDFLARE_API_TOKEN`, and put the account ID in `CLOUDFLARE_ACCOUNT_ID`. A deployed Worker or custom domain is not required for the REST benchmark.
- Gemini: use [AI Studio API keys](https://aistudio.google.com/apikey), create a Free Tier project/key, and paste it into `GEMINI_API_KEY`. Keep Google Cloud Translation's separate key empty. This is optional; no billing setup is needed for the documented Free Tier.
- Cerebras: use [Cerebras Cloud](https://cloud.cerebras.ai/) only if the payment-method step is acceptable. Paste its API key into `CEREBRAS_API_KEY`. No trial or paid usage was activated in this research.

Use the existing short/long corpus and report success counts, HTTP errors, first-round timing, median, slower tail, and complete translations. Pace Azure by characters as well as requests to stay within its F0 throughput limit. LLM benchmarks should also record thinking settings and truncation, since a fast incomplete translation is not a successful result.

## Primary sources

- [Groq model catalog](https://console.groq.com/docs/models), [Free plan rate limits](https://console.groq.com/docs/rate-limits), [Qwen modes](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [billing](https://console.groq.com/docs/billing-faqs).
- [Cloudflare M2M100 API](https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/), [Workers AI pricing and paid-model exceptions](https://developers.cloudflare.com/workers-ai/platform/pricing/), [REST setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [Meta's model card and language list](https://huggingface.co/facebook/m2m100_1.2B).
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Free Tier and regional billing FAQ](https://ai.google.dev/gemini-api/docs/billing), [account-specific limits](https://ai.google.dev/gemini-api/docs/rate-limits).
- [Current Cerebras pricing](https://www.cerebras.ai/pricing).
- [OpenCode Go models, endpoints, intended traffic, and limits](https://opencode.ai/docs/go/), [GLM thinking requirements](https://docs.z.ai/guides/capabilities/thinking-mode).
- [OpenCode Zen free-model IDs, limited-time availability, and data use](https://opencode.ai/docs/zen/). The OpenCode-client restriction above comes from the recorded live API response.
- [Amazon Translate pricing](https://aws.amazon.com/translate/pricing/), [AWS account Free Tier rules](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html), [Amazon supported languages](https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html).
