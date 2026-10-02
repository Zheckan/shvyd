#!/usr/bin/env python3
"""Build a comparison from completed cloud runs, preserving raw and failed runs."""
import importlib.util
import json
from pathlib import Path
import argparse
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("cloud_benchmark", ROOT / "scripts/benchmark-cloud.py")
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)

NAMES = {
    "azure-en": "Azure, English source", "azure-auto": "Azure, automatic source",
    "deepl-latency_optimized-en": "DeepL speed, English source",
    "deepl-latency_optimized-auto": "DeepL speed, automatic source",
    "deepl-quality_optimized-en": "DeepL quality, English source",
    "deepl-quality_optimized-auto": "DeepL quality, automatic source",
    "cohere-north-complete": "North Small Translate, complete",
    "cohere-north-stream": "North Small Translate, streamed",
    "cohere-r7b-complete": "Command R7B, complete",
    "cohere-r7b-stream": "Command R7B, streamed",
    "google-en": "Google NMT, English source", "google-auto": "Google NMT, automatic source",
    "groq-qwen-complete": "Groq Qwen3.8, complete", "groq-qwen-stream": "Groq Qwen3.8, streamed",
    "cloudflare-m2m100-en": "Cloudflare M2M100, English source",
    "gemini-flash-lite-complete": "Gemini 3.1 Flash-Lite, complete",
    "gemini-flash-lite-stream": "Gemini 3.1 Flash-Lite, streamed",
    "cerebras-qwen-complete": "Cerebras Qwen3.8, complete", "cerebras-qwen-stream": "Cerebras Qwen3.8, streamed",
}
SIZES = ["word", "short", "sentence", "paragraph", "long", "large"]


def stats(rows):
    return benchmark.summarize(rows)[rows[0]["variant"]][rows[0]["phase"]] if rows else {}


def escape(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    args = parser.parse_args()
    datetime.strptime(args.date, "%Y-%m-%d")
    directory = ROOT / "docs/benchmarks" / args.date
    runs = []
    selected = {"core": {}, "realistic": {}}
    for path in sorted(directory.glob("cloud-*/results.json")):
        data = json.loads(path.read_text())
        runs.append((path, data))
        if not data["metadata"].get("finished_at"):
            continue
        sizes = {item.get("size") if isinstance(item, dict) else "core" for item in data["inputs"]}
        if len(data["inputs"]) == 18 and sizes == set(SIZES):
            cohort = "realistic"
        elif sizes == {"core"}:
            cohort = "core"
        else:
            # Smaller paced subsets have a different content mix and belong in
            # their own matched-input comparison, rather than the core table.
            continue
        for variant in data["summary"]:
            rows = [item for item in data["samples"] if item["variant"] == variant and item["phase"] == "warm"]
            if any(item["ok"] for item in rows):
                selected[cohort][variant] = {"source": str(path.relative_to(directory)), "rows": rows,
                                            "all_rows": [item for item in data["samples"] if item["variant"] == variant],
                                            "metadata": data["metadata"]}
    summary = {"core": {}, "realistic": {}, "sources": {}, "run_notes": [],
               "transport": "Python http.client HTTP/1.1, network time included"}
    for cohort, variants in selected.items():
        for variant, entry in variants.items():
            summary["sources"][cohort + "/" + variant] = entry["source"]
            if cohort == "core":
                summary[cohort][variant] = stats(entry["rows"])
                first = [row for row in entry["rows"] if row["round"] == 0]
                summary[cohort][variant]["first_round"] = stats(first)
            else:
                summary[cohort][variant] = {}
                for size in SIZES:
                    rows = [row for row in entry["rows"] if row.get("size") == size]
                    summary[cohort][variant][size] = stats(rows)
                    summary[cohort][variant][size]["first_round"] = stats([row for row in rows if row["round"] == 0])
    for path, data in runs:
        reasons = []
        if not data["metadata"].get("finished_at"):
            reasons.append("Run did not finish; excluded from comparison")
        if any(row.get("status") == 429 for row in data["samples"]):
            reasons.append("Contains HTTP 429 failures; inspect recorded attempts and pacing")
        if any(not row.get("ok") and row.get("status") == 200 for row in data["samples"]):
            reasons.append("Contains HTTP 200 responses that failed parsing or generation checks; inspect raw failures")
        if reasons:
            summary["run_notes"].append({"source": str(path.relative_to(directory)), "notes": reasons})
    summary["selected_warm_attempts"] = sum(len(entry["rows"]) for variants in selected.values() for entry in variants.values())
    summary["selected_warm_successes"] = sum(sum(row["ok"] for row in entry["rows"]) for variants in selected.values() for entry in variants.values())
    summary["recorded_timed_attempts"] = sum(len(data["samples"]) for _, data in runs)
    summary["recorded_deepl_billed_characters"] = sum(row.get("billed_characters") or 0 for _, data in runs for row in data["samples"])
    usage_path = directory / "cloud-usage.json"
    if usage_path.exists():
        summary["usage_audit"] = json.loads(usage_path.read_text())
    (directory / "cloud-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")

    lines = ["# Cloud translation benchmark, " + args.date, "",
        "This report compares the configured translation services on the same Mac used for the earlier local benchmark. The core set covers the same 12 short texts as the local engines. The realistic set adds 18 texts from one word to roughly 600 words, with three texts at each size and three rounds per text.", "",
        "## Environment and method", "",
        "- Apple M4 Pro, 48 GiB RAM, arm64 macOS; requests originate from this machine on its current network.",
        "- English to Ukrainian. Azure and DeepL compare explicit English with automatic source detection; the realistic selection workflow uses automatic detection.",
        "- Python standard-library HTTPS client, HTTP/1.1. Time starts before sending the request and ends after reading and decoding the entire response. No local translation cache and no hidden retries.",
        "- One request at a time in each run. Providers and inputs are shuffled with seed 42. The final paced DeepL run and the other benchmark runs execute sequentially.",
        "- Warm requests reuse the variant's connection. Connection reuse is recorded for each request. First and representative fresh-connection requests are retained separately in the raw JSON.",
        "- Provider caching cannot be disabled. First-round numbers are included separately; warmed model state and repeated-text caches may affect later rounds. The first-round seed text also appears in the initial readiness request.",
        "- DeepL's initial burst run was rate limited. Later runs space DeepL requests at least two seconds apart. Cohere starts are spaced at least 3.2 seconds apart. These deliberate waits are outside the measured request latency.",
        "- Failed requests, incomplete LLM generations, and parser failures are counted as failures and excluded from successful latency percentiles. Cloudflare M2M100 has no completion reason: its nonempty API responses can still be incomplete translations. Review the additional cloud report before interpreting that model's timings.",
        "- LLMs use temperature 0, a translation-only prompt, and an output-token ceiling that grows with source length, capped at 4,000 tokens. Streaming captures the first nonempty text delta and the full completed message.",
        "- P95 uses nearest rank. Each realistic size has nine planned warm requests, so its P95 is the slowest successful request in that small group. Treat tail numbers as observations from this run.",
        "- Size groups contain different content. Their timing differences combine input length, content, provider state, and network variability; the results are not guaranteed to increase monotonically with text length.",
        "- These are service benchmarks. Browser HTTP/2 or HTTP/3, extension messaging, worker wake-up, popup layout, and complete click-to-visible latency are not measured.", "",
        "## Core set, same inputs as the local benchmark", "",
        "All timing columns are milliseconds. The later paced DeepL repeats use three rounds; Azure and complete-response Cohere use five rounds. Counts are shown explicitly.", "",
        "| Variant | Success / attempts | Median | P95 | First-round median | Source |",
        "|---|---:|---:|---:|---:|---|"]
    for variant, entry in selected["core"].items():
        result = summary["core"][variant]
        lines.append(f"| {NAMES.get(variant, variant)} | {result['successful']} / {result['attempted']} | {result['median_ms']:.2f} | {result['p95_ms']:.2f} | {result['first_round'].get('median_ms', 0):.2f} | [Raw]({entry['source']}) |")
    corpus = json.loads((ROOT / "docs/benchmarks/inputs-realistic-en-uk.json").read_text())
    lines += ["", "## Realistic text sizes", "", "| Size | Characters per text | Words per text | Distinct texts | Rounds |", "|---|---:|---:|---:|---:|"]
    for size in SIZES:
        items = [item for item in corpus if item["size"] == size]
        chars = [len(item["text"]) for item in items]
        words = [len(item["text"].split()) for item in items]
        lines.append(f"| {size} | {min(chars)} to {max(chars)} | {min(words)} to {max(words)} | 3 | 3 |")
    for column, title in [("median_ms", "Full translation median, milliseconds"), ("p95_ms", "Full translation P95, milliseconds"), ("first_text_median_ms", "First streamed text median, milliseconds")]:
        variants = [variant for variant in selected["realistic"] if column != "first_text_median_ms" or variant.endswith("stream")]
        lines += ["", "### " + title, "", "| Size | " + " | ".join(NAMES.get(variant, variant) for variant in variants) + " |", "|---|" + "---:|" * len(variants)]
        for size in SIZES:
            cells = [f"{summary['realistic'][variant][size][column]:.2f}" if column in summary['realistic'][variant][size] else "Unmeasured" for variant in variants]
            lines.append("| " + size + " | " + " | ".join(cells) + " |")
    variants = list(selected["realistic"])
    lines += ["", "### First-round full translation median, milliseconds", "",
              "Each cell uses the first three distinct texts at that size. Later repetitions are omitted from this table. Provider-side state and caches remain uncontrolled.", "",
              "| Size | " + " | ".join(NAMES.get(variant, variant) for variant in variants) + " |", "|---|" + "---:|" * len(variants)]
    for size in SIZES:
        cells = [f"{summary['realistic'][variant][size]['first_round']['median_ms']:.2f}" if 'median_ms' in summary['realistic'][variant][size]['first_round'] else "Unmeasured" for variant in variants]
        lines.append("| " + size + " | " + " | ".join(cells) + " |")
    lines += ["", "### Realistic request counts", "", "| Variant | Successful / attempted warm requests | Source |", "|---|---:|---|"]
    for variant, entry in selected["realistic"].items():
        successful = sum(row["ok"] for row in entry["rows"])
        lines.append(f"| {NAMES.get(variant, variant)} | {successful} / {len(entry['rows'])} | [Raw]({entry['source']}) |")
    lines += ["", "## Translation examples", "",
        "These are actual outputs from the core run, selected to expose ambiguity and idioms. They are a small qualitative sample, not an independent accuracy score. Repeated outputs and complete long translations remain in the raw JSON.", ""]
    quality_variants = list(selected["core"])
    lines += ["| Source | " + " | ".join(NAMES.get(variant, variant) for variant in quality_variants) + " |", "|---|" + "---|" * len(quality_variants)]
    for text in ["bank", "I am feeling blue.", "He eventually spilled the beans.", "It costs an arm and a leg.", "The river bank is steep."]:
        cells = []
        for variant in quality_variants:
            matches = [row for row in selected["core"][variant]["rows"] if row["text"] == text and row["ok"]]
            cells.append(escape(matches[0]["translation"]) if matches else "Unmeasured")
        lines.append("| " + escape(text) + " | " + " | ".join(cells) + " |")
    lines += ["", "## Setup and failures retained", "",
        "- DeepL initially rejected the pasted credential on both official hosts. A canonical key was found with one extra copied character around it. That corrected value authenticated at `api-free.deepl.com` before `.env` was updated. The account initially reported zero usage and a 1,000,000-character allowance.",
        "- Cohere's documented `north-small-translate-1-0` returned HTTP 404. The authenticated model list exposed `north-small-translate-09-2026`, which worked and is used in the benchmark. Command R7B uses `command-r7b-12-2024`.",
        "- The first streaming parser did not accept the final `[DONE]` marker. Its two failed readiness measurements are retained, excluded from latency comparisons, and followed by corrected streaming runs. A regression test covers this case.",
        "- An early all-blocked setup run stopped before producing timed samples. The fixed runner produces an empty report without crashing when no credentials are available.", ""]
    for path, data in runs:
        failures = [row for row in data["samples"] if not row.get("ok")]
        status = "completed" if data["metadata"].get("finished_at") else "incomplete setup run"
        lines.append(f"- [{path.parent.name}]({path.relative_to(directory)}): {status}, {len(data['samples'])} timed attempts, {len(failures)} failures. Raw results are preserved.")
    lines += ["", f"The selected comparisons contain {summary['selected_warm_successes']} successful warm translations from {summary['selected_warm_attempts']} attempts. All preserved runs together contain {summary['recorded_timed_attempts']} timed translation attempts, including setup and burst failures."]
    if "usage_audit" in summary:
        usage = summary["usage_audit"]["usage"]
        lines += ["", f"The [DeepL usage audit](cloud-usage.json) reports {usage['character_count']:,} characters used from a {usage['character_limit']:,}-character allowance, with {usage['remaining_characters']:,} remaining. The successful recorded responses' billed-character total matches that usage."]
    lines += ["", "## Interpretation for the prototype", "",
        "The original Azure/DeepL/Cohere comparison supported trying Azure as the first provider for a fast Helium prototype. Additional provider rows need review before updating that recommendation. The extension can store the target language locally and ask Azure to detect the source in the same translation request. This is a provider choice to verify in the extension, not a measured click-to-visible result.",
        "", "DeepL handled the tested idioms more naturally than Azure, and its speed and quality modes produced the same idiom outputs in this small sample. Use the size tables to judge its latency cost. The burst test also shows that the free endpoint needs sensible pacing and explicit rate-limit handling.",
        "", "North Small Translate starts streaming text quickly, but generating a complete long passage takes substantially longer than a dedicated translation request. Command R7B was slower on long passages and made observable errors, including a literal river-bank translation and untranslated English words such as `deserve` and `repeatedly` in a long passage. These observations do not constitute a formal accuracy benchmark."]
    lines += ["", "## Google and local engines", "",
        "Google Cloud Translation Basic v2 is implemented in the runner and has an optional `.env` section. It is the traditional NMT API. The user chose to skip Google after the account setup requested a payment. No Google account or billing changes were made by the agent, and no Google cloud latency is claimed. Setup documentation remains available in [API keys](../../api-keys.md) if this decision changes.",
        "", "The earlier [local report](../2026-10-02/report.md) used the same core source set. Chrome native translation had a 3.10 ms warm median, while portable Bergamot with the modern model in Helium had 11.40 ms. Those engine-only timings exclude network and popup UI. Helium's native Translator did not complete creation within 30 seconds, and the tested Bergamot wrapper allocated a 522.625 MiB Wasm heap. Local idiom outputs were often literal.", "",
        "## Reproduce", "", "```sh", "python3 scripts/test_benchmark_cloud.py",
        "python3 scripts/benchmark-cloud.py --check",
        "python3 scripts/benchmark-cloud.py --inputs docs/benchmarks/inputs-realistic-en-uk.json --rounds 3",
        "python3 scripts/report-cloud.py", "```", "",
        "Every benchmark run creates a new result path. `.env` remains ignored by Git and has permissions 0600. The credential-free template is `.env.example`. The [machine-readable summary](cloud-summary.json) links each selected measurement to its source run.", "",
        "## Primary references", "",
        "- [Azure Translator API 2026-06-06](https://devblogs.microsoft.com/foundry/azure-translator-api-version-2026-06-06-ga-supporting-multilingual-applications-with-flexible-translation-options/)",
        "- [DeepL translation parameters](https://developers.deepl.com/api-reference/translate/request-translation)",
        "- [DeepL HTTP 429 errors](https://support.deepl.com/hc/en-us/articles/9773964275868-DeepL-API-error-messages)",
        "- [North Small Translate](https://docs.cohere.com/docs/north-small-translate-1.0), [Cohere model discovery](https://docs.cohere.com/reference/list-models), [streaming format](https://docs.cohere.com/reference/chat-stream)",
        "- [Google Basic v2 translation](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate), [API-key authentication](https://docs.cloud.google.com/translate/docs/authentication#api-keys)"]
    (directory / "cloud-report.md").write_text("\n".join(lines) + "\n")
    print("Wrote cloud-report.md and cloud-summary.json from completed runs.")


if __name__ == "__main__":
    main()
