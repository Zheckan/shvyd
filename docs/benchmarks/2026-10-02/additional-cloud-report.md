# Additional cloud translation benchmark, 2026-10-02

Groq, Gemini, and Cloudflare authenticated successfully. Groq produced the fastest first streamed text in the new tests, but its configured Free account rejected large output requests. Gemini completed the full repeated corpus. Cloudflare returned nonempty responses while omitting content and repeating unrelated text. Cerebras remains optional and unconfigured.

The original [cloud report](cloud-report.md) and its [summary](cloud-summary.json) are preserved. This report adds new results and compares identical inputs where Groq has a smaller supported test set. The [new machine-readable summary](additional-cloud-summary.json) records every source path and sample count.

## Method and limits

- Apple M4 Pro, 48 GiB RAM, arm64 macOS, same machine and network as the earlier cloud tests. English to Ukrainian.
- Direct HTTPS requests through Python standard-library HTTP/1.1, one request at a time. Providers were tested in sequential batches. Earlier baseline batches and these later batches were not simultaneous.
- Gemini and Cloudflare: 18 distinct inputs, three texts at each of six sizes, three rounds, 54 warm requests per variant.
- Final Groq: five exact texts from that corpus, one at each supported size through 1,694 characters / 270 source words, three rounds, 15 warm requests. The [five-text subset](../inputs-groq-supported-en-uk.json) is immutable input data for this comparison.
- The matched tables below select exactly those same five texts and three repeats from Azure, DeepL, Cohere, and Gemini. Each cell has three successful observations, so nearest-rank P95 is simply the slowest of three. It is not a dependable population tail estimate.
- Warm requests reuse connections. One initial request and three representative fresh-connection requests are archived separately. No local cache and no hidden retries. Provider caching, load, and network variation remain uncontrolled.
- Time includes network and reading the response. Deliberate quota waits are excluded. First text means the first nonempty visible translation delta, with reasoning excluded. These timings do not measure extension click-to-visible latency.
- Groq Qwen3.8 uses reasoning_effort=none, temperature 0, and a final 1,000-token request ceiling. Gemini 3.1 Flash-Lite uses temperature 0 and thinkingLevel=MINIMAL. Normal completion reasons are required; token-limited output is a failure.
- Azure and DeepL use automatic source detection in the comparison. Cloudflare requires explicit English and has no completion reason. Its API-success counts do not establish that the entire source was translated.

## Matched full-response medians

Milliseconds, three repeats of one identical source per size.

| Size / source characters | Azure auto | DeepL speed auto | DeepL quality auto | Groq Qwen3.8 | Gemini 3.1 Flash-Lite |
|---|---:|---:|---:|---:|---:|
| word / 4 | 47.77 | 136.11 | 145.27 | 79.04 | 631.44 |
| short / 18 | 49.05 | 163.03 | 149.89 | 136.73 | 911.41 |
| sentence / 117 | 156.51 | 241.98 | 280.85 | 260.86 | 831.61 |
| paragraph / 523 | 481.39 | 757.81 | 1002.90 | 443.89 | 1798.11 |
| long / 1694 | 387.21 | 820.56 | 895.68 | 1168.43 | 2169.83 |

## Matched first visible streamed text

| Size | North Small Translate | Groq Qwen3.8 | Gemini 3.1 Flash-Lite |
|---|---:|---:|---:|
| word | 206.15 | 76.97 | 627.49 |
| short | 217.53 | 118.92 | 870.48 |
| sentence | 213.46 | 197.16 | 754.43 |
| paragraph | 216.22 | 64.21 | 1357.52 |
| long | 218.28 | 92.11 | 805.81 |

## Matched slower observations

Full-response P95 in milliseconds. With only three observations per cell this is the observed maximum.

| Size | Azure auto | DeepL speed auto | DeepL quality auto | Groq Qwen3.8 | Gemini 3.1 Flash-Lite |
|---|---:|---:|---:|---:|---:|
| word | 77.42 | 138.03 | 163.70 | 125.19 | 851.53 |
| short | 117.54 | 172.89 | 165.56 | 147.00 | 2401.33 |
| sentence | 215.43 | 257.11 | 282.74 | 739.00 | 979.82 |
| paragraph | 558.53 | 957.80 | 1051.58 | 703.23 | 3440.78 |
| long | 481.56 | 915.65 | 969.24 | 1251.35 | 2349.23 |

## Approximately 600-word passages

These rows use the full corpus: three different passages, three repeats each, nine warm responses per provider. Groq is excluded because its repeated large-output request was rejected. Cloudflare is excluded because all nine outputs at this size were demonstrably incomplete.

| Variant | Successful / attempted | Full-response median ms | P95 ms | First-text median ms |
|---|---:|---:|---:|---:|
| Azure auto | 9 / 9 | 398.12 | 1441.37 | Complete response |
| DeepL speed auto | 9 / 9 | 1007.41 | 1227.26 | Complete response |
| DeepL quality auto | 9 / 9 | 1247.47 | 1379.11 | Complete response |
| North Small Translate | 9 / 9 | 5545.78 | 6409.28 | 243.20 |
| Command R7B | 9 / 9 | 14436.87 | 16950.65 | 247.74 |
| Gemini 3.1 Flash-Lite | 9 / 9 | 4220.48 | 5734.03 | 852.86 |

## New-provider counts

| Variant / final selected set | Warm API successes / attempts | Initial / fresh checks | Notes |
|---|---:|---|---|
| Groq Qwen3.8, five supported inputs | 15 / 15 | 1 / 1 initial; 3 / 3 fresh | Actual request capped at 1,000 output tokens; largest size excluded |
| Gemini 3.1 Flash-Lite, full corpus | 54 / 54 | 1 / 1 initial; 3 / 3 fresh | Normal STOP completion on every selected request |
| Cloudflare M2M100, full corpus | 54 / 54 nonempty API responses | 1 / 1 initial; 3 / 3 fresh | At least 24 of the warm responses demonstrably omit source content |
| Cerebras | Unmeasured | Unconfigured | Optional trial requires a payment method |

## Groq quota failures and correction

The public Free quota lists 8,000 combined tokens/minute, but the configured organization also enforces 1,000 output tokens/minute. The initial mixed run rejected a paragraph with HTTP 429 after a large response. The runner stopped further Groq requests and preserved the failure.

A separate output-budget pacer allowed more measurements. However, repeating the 623-word input then returned Request too large: expected output of 1,383 tokens exceeded the enforced 1,000-token limit. One earlier successful response took 2,907.074 ms and generated 1,383 tokens; another distinct large input had succeeded in the initial mixed run. Those isolated successes do not establish reliable access for long selections.

A following shorter-text run still sent an output ceiling above the limit and was rejected. The final correction sets GROQ_MAX_OUTPUT_TOKENS=1000 in the actual request and paces the output allowance separately. The five supported inputs then passed all three repeats and all fresh checks. Larger complete outputs need an adequate account allowance or a separately measured chunking strategy. No output was shortened to make a successful latency row.

## Translation observations

These are manual observations from synthetic inputs, not an independent accuracy score. Successful HTTP responses and normal finish reasons do not certify translation quality.

- Gemini translated the idiom passage naturally: Після зустрічі я почувався пригніченим, але прогулянка біля річки допомогла. Новий ноутбук коштує шалених грошей, тому я почекаю до кінця місяця, перш ніж купувати його.
- Cloudflare translated the same passage literally: Я відчував себе синім після зустрічі, але прогулянка по річці допомогла.Новий ноутбук коштує руку і ногу, тому я буду чекати до кінця місяця, перш ніж купити його.
- Groq preserved the inspected supported paragraph and long passage, but one earlier uncapped large sample included the malformed phrase "Одинадво надзвичайно швидкий запит". Its actual outputs are retained for Ukrainian-language review.

Cloudflare omitted the second sentence of sentence-2, the final sentence of paragraph-3, and substantial content in all three long and all three large inputs. Each of those eight distinct outputs was byte-identical across its three repeats, giving at least 24 incomplete responses among 54 warm API successes. The [completeness review](cloud-204004/cloudflare-review.json) records input IDs, rounds, hashes, and the specific missing content. Unflagged outputs are not certified correct.

## Implications for the prototype

Azure remains the strongest candidate for fast completed long translations in this measured set. Groq offers very fast first text and competitive paragraph latency, but the configured Free output allowance limits large selections. Gemini is a working alternative with good observed idiom handling and slower first text. DeepL remains a useful dedicated alternative for quality. Cloudflare M2M100 is unsuitable as the default based on the omissions and repetitions observed here.

Cerebras can be skipped if recurring free access and avoiding billing setup are priorities. Its current pricing offers $5 promotional credit after adding a payment method, expiring after 30 days. Cerebras states that activation does not charge the card or automatically enroll paid usage. To test it, activate the trial in Cerebras Cloud, create a key under API Keys in the left navigation, and paste only that key into CEREBRAS_API_KEY. The public endpoint and qwen-3.8-27b model default are already configured. No Cerebras latency is claimed.

## Archived new runs

- [cloud-203946](cloud-203946/results.json): 3 timed attempts, 0 API/generation failures. All outputs and errors retained.
- [cloud-204004](cloud-204004/results.json): 119 timed attempts, 1 API/generation failures. All outputs and errors retained.
- [cloud-205450](cloud-205450/results.json): 12 timed attempts, 1 API/generation failures. All outputs and errors retained.
- [cloud-210111](cloud-210111/results.json): 5 timed attempts, 1 API/generation failures. All outputs and errors retained.
- [cloud-210448](cloud-210448/results.json): 19 timed attempts, 0 API/generation failures. All outputs and errors retained.

The new archive contains 158 timed attempts and 3 API/generation failures. This count is separate from the Cloudflare semantic omissions and the earlier baseline archive.

## Reproduce

```sh
python3 scripts/test_benchmark_cloud.py
python3 scripts/benchmark-cloud.py --check
python3 scripts/benchmark-cloud.py --inputs docs/benchmarks/inputs-realistic-en-uk.json --rounds 3 --variants gemini-flash-lite-stream,cloudflare-m2m100-en
python3 scripts/benchmark-cloud.py --inputs docs/benchmarks/inputs-groq-supported-en-uk.json --rounds 3 --variants groq-qwen-stream --groq-output-tpm 1000
# Optional, after adding a Cerebras key:
python3 scripts/benchmark-cloud.py --smoke-only --variants cerebras-qwen-stream
```

Every live run writes a new timestamped raw file. The environment file is ignored by Git and remains mode 0600. Requests use cloud API keys directly. No OpenCode CLI inference is involved.

## Primary references

- [Groq account-specific input/output limits and response headers](https://console.groq.com/docs/rate-limits), [Qwen model modes](https://console.groq.com/docs/model/qwen/qwen3.8-27b). The 1,000-token restriction above comes from archived live rejections.
- [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [GenerateContent and thinking settings](https://ai.google.dev/api/generate-content).
- [Cloudflare M2M100 request parameters](https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/).
- [Cerebras current trial terms](https://www.cerebras.ai/pricing), [API key creation and direct REST quickstart](https://inference-docs.cerebras.ai/quickstart).
