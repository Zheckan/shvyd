# Translation benchmarks

The current [translation options and prototype recommendation](../translation-options.md) consolidates these results, provider allowances, and the speculative offline-mode idea.

| Date | Pair | Hardware | Scope | Report | Raw data |
|---|---|---|---|---|---|
| 2026-10-02 | English -> Ukrainian | Apple M4 Pro, 48 GiB | Local engines in Helium and Chrome; earlier MyMemory aggregates; other cloud providers pending keys | [Report](2026-10-02/report.md) | [JSON](2026-10-02/results.json) |
| 2026-10-02 | English -> Ukrainian | Apple M4 Pro, 48 GiB | Azure, DeepL speed/quality, North Small Translate and Command R7B; short core set and 18 realistic texts up to about 600 words; Google skipped by user | [Cloud report](2026-10-02/cloud-report.md) | [Summary and raw-run links](2026-10-02/cloud-summary.json) |
| 2026-10-02 | English -> Ukrainian | Apple M4 Pro, 48 GiB | OpenCode Go MiMo/GLM blocked by the five-hour quota; Zen free MiMo blocked outside OpenCode; partial Azure control archived | [Additional providers and attempt notes](../additional-providers.md) | [Go attempt](2026-10-02/go-195318/results.json), [Zen free attempt](2026-10-02/zen-free-195805/results.json) |
| 2026-10-02 | English -> Ukrainian | Apple M4 Pro, 48 GiB | Groq Qwen3.8, Gemini 3.1 Flash-Lite, and Cloudflare M2M100; matched comparison with earlier providers; Groq output limits and Cloudflare omissions retained | [Additional cloud report](2026-10-02/additional-cloud-report.md) | [Summary and raw-run links](2026-10-02/additional-cloud-summary.json), [Cloudflare review](2026-10-02/cloud-204004/cloudflare-review.json) |
| 2026-10-02 | English -> Ukrainian | Apple M4 Pro, 48 GiB | Gemini 3.5 Flash-Lite and 3.8 Flash; five OpenCode Go models; six text sizes repeated three times; first text, completion, route corrections, failures and quotas | [Model comparison](2026-10-02/model-comparison-report.md), [model research and browser opinion](2026-10-02/model-research.md) | [Summary with source hashes and raw-run links](2026-10-02/model-comparison-summary.json) |

Keep each dated report and raw dataset when adding a new run. Compare the same input set and separate model download, cold startup, warm translation, and complete extension interaction times.

The first row is the original local-test snapshot, collected before cloud keys were available. The second row records the later cloud comparison.

Shared corpora are [the original 12 short inputs](inputs-en-uk.json) and [18 realistic inputs](inputs-realistic-en-uk.json). The realistic set has three texts at each of six sizes, from 4 characters to 4,023 characters. It covers UI labels, messages, paragraphs, technical documentation, travel planning, and release process passages.

The final [Groq supported subset](inputs-groq-supported-en-uk.json) contains five exact texts from the full corpus, through 1,694 characters / 270 source words. Its three repeats are compared with the same inputs from the other providers. The earlier [six-text Groq subset](inputs-groq-paced-en-uk.json) remains archived because its largest repeated request was rejected by the account's output limit. The additional report keeps that failure distinct from the successful shorter-text comparison.

```sh
python3 scripts/test_benchmark_cloud.py
python3 scripts/benchmark-cloud.py --check
python3 scripts/benchmark-cloud.py --inputs docs/benchmarks/inputs-realistic-en-uk.json --rounds 3
python3 scripts/report-cloud.py --date YYYY-MM-DD
```

The runner stores results under the current UTC date and never overwrites an existing raw result file. The report generator selects the latest completed measurement for each variant and corpus, preserves failure notes, and writes a summary alongside the raw runs. Requests are paced; deliberate waiting is excluded from request latency. Provider caching and service load remain uncontrolled, so compare first-round and repeated results as well as medians.
