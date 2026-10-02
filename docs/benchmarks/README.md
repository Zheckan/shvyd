# Translation benchmarks

| Date | Pair | Hardware | Scope | Report | Raw data |
|---|---|---|---|---|---|
| 2026-10-02 | English -> Ukrainian | Apple M4 Pro, 48 GiB | Local engines in Helium and Chrome; earlier MyMemory aggregates; other cloud providers pending keys | [Report](2026-10-02/report.md) | [JSON](2026-10-02/results.json) |
| 2026-10-02 | English -> Ukrainian | Apple M4 Pro, 48 GiB | Azure, DeepL speed/quality, North Small Translate and Command R7B; short core set and 18 realistic texts up to about 600 words; Google skipped by user | [Cloud report](2026-10-02/cloud-report.md) | [Summary and raw-run links](2026-10-02/cloud-summary.json) |

Keep each dated report and raw dataset when adding a new run. Compare the same input set and separate model download, cold startup, warm translation, and complete extension interaction times.

The first row is the original local-test snapshot, collected before cloud keys were available. The second row records the later cloud comparison.

Shared corpora are [the original 12 short inputs](inputs-en-uk.json) and [18 realistic inputs](inputs-realistic-en-uk.json). The realistic set has three texts at each of six sizes, from 4 characters to 4,023 characters. It covers UI labels, messages, paragraphs, technical documentation, travel planning, and release process passages.

```sh
python3 scripts/test_benchmark_cloud.py
python3 scripts/benchmark-cloud.py --check
python3 scripts/benchmark-cloud.py --inputs docs/benchmarks/inputs-realistic-en-uk.json --rounds 3
python3 scripts/report-cloud.py --date YYYY-MM-DD
```

The runner stores results under the current UTC date and never overwrites an existing raw result file. The report generator selects the latest completed measurement for each variant and corpus, preserves failure notes, and writes a summary alongside the raw runs. Requests are paced; deliberate waiting is excluded from request latency. Provider caching and service load remain uncontrolled, so compare first-round and repeated results as well as medians.
