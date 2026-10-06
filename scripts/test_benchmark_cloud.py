"""Exercise the benchmark CLI without real credentials or network requests."""
import json
import importlib.util
import io
from contextlib import redirect_stdout
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace


SCRIPT = Path(__file__).with_name("benchmark-cloud.py")


class BenchmarkPacingTests(unittest.TestCase):
    def run_simulated(self, translate):
        spec = importlib.util.spec_from_file_location("cloud_pacing_test", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        clock = [100.0]
        with tempfile.TemporaryDirectory() as directory:
            inputs = Path(directory) / "inputs.json"
            inputs.write_text(json.dumps(["word", "a" * 1500, "b" * 4000]))
            args = SimpleNamespace(inputs=inputs, providers="groq", variants="groq-qwen-stream",
                                   output=Path(directory) / "results.json", rounds=1,
                                   smoke_only=False, deepl_interval=2, gemini_interval=15,
                                   groq_output_tpm=1000)
            config = {**module.DEFAULTS, "GROQ_API_KEY": "synthetic-secret"}

            def fake_translate(variant, text, connection, values):
                sample = translate(text, clock[0])
                return {"variant": variant["id"], "text": text, "characters": len(text),
                        "milliseconds": 1, **sample}

            def sleep(seconds):
                clock[0] += seconds

            with patch.object(module, "translate", side_effect=fake_translate), \
                    patch.object(module.time, "monotonic", side_effect=lambda: clock[0]), \
                    patch.object(module.time, "sleep", side_effect=sleep), redirect_stdout(io.StringIO()):
                module.run_benchmark(args, config)
            return json.loads(args.output.read_text())

    def test_long_groq_generations_respect_separate_output_token_budget(self):
        starts = []

        def translate(text, started):
            starts.append(started)
            return {"ok": True, "status": 200, "usage": {"completion_tokens": 1200},
                    "translation": "переклад"}

        self.run_simulated(translate)
        # After one 1,200-token response, even a 512-token request needs at least
        # 42.72 seconds to fit a 1,000-output-token/minute refill budget.
        self.assertGreaterEqual(starts[1] - starts[0], 42.72)

    def test_quota_rejection_during_fresh_phase_stops_remaining_requests(self):
        attempts = []

        def translate(text, started):
            attempts.append(started)
            if len(attempts) >= 5:
                return {"ok": False, "status": 429, "provider_error": {"error": "quota"}}
            return {"ok": True, "status": 200, "usage": {"completion_tokens": 10},
                    "translation": "переклад"}

        result = self.run_simulated(translate)
        self.assertEqual(len(attempts), 5)
        self.assertEqual(sum(row["phase"] == "fresh" for row in result["samples"]), 1)


class BenchmarkCliTests(unittest.TestCase):
    def test_current_gemini_models_use_their_lowest_supported_thinking_levels(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("GEMINI_API_KEY=synthetic-secret\n")
            result = subprocess.run([sys.executable, str(SCRIPT), "--env", str(env), "--dry-run",
                                     "--variants", "gemini-3.5-flash-lite-stream,gemini-3.8-flash-stream"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = {row["variant"]: row for row in json.loads(result.stdout)}
            self.assertEqual(len(rows), 2)
            for model, thinking in (("gemini-3.5-flash-lite", "MINIMAL"), ("gemini-3.8-flash", "LOW")):
                row = rows[model + "-stream"]
                self.assertIn("/models/" + model + ":", row["path"])
                self.assertEqual(row["body"]["generationConfig"]["thinkingConfig"]["thinkingLevel"], thinking)
                self.assertEqual(row["headers"]["X-Goog-Api-Key"], "[redacted]")

    def test_groq_request_ceiling_fits_free_output_limit_on_long_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("GROQ_API_KEY=synthetic-secret\n")
            inputs = Path(directory) / "inputs.json"
            inputs.write_text(json.dumps(["a" * 2400]))
            result = subprocess.run([sys.executable, str(SCRIPT), "--env", str(env), "--dry-run",
                                     "--inputs", str(inputs), "--providers", "groq"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = json.loads(result.stdout)
            for row in rows:
                self.assertIn("a" * 2400, row["body"]["messages"][0]["content"])
                self.assertEqual(row["body"]["max_completion_tokens"], 1000)

    def test_request_preview_uses_direct_endpoints_and_redacts_cloudflare_token(self):
        secret = "synthetic-provider-credential"
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text(f"GROQ_API_KEY={secret}\nCLOUDFLARE_API_TOKEN={secret}\n"
                           f"CLOUDFLARE_ACCOUNT_ID={'a'*32}\nGEMINI_API_KEY={secret}\n"
                           f"CEREBRAS_API_KEY={secret}\n")
            result = subprocess.run([sys.executable, str(SCRIPT), "--env", str(env), "--dry-run",
                                     "--providers", "groq,cloudflare,gemini,cerebras"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(secret, result.stdout + result.stderr)
            rows = {r["variant"]: r for r in json.loads(result.stdout)}
            groq = rows["groq-qwen-stream"]
            self.assertEqual(groq["path"], "/openai/v1/chat/completions")
            self.assertEqual(groq["body"]["reasoning_effort"], "none")
            cf = rows["cloudflare-m2m100-en"]
            self.assertEqual(cf["body"]["source_lang"], "en")
            self.assertEqual(cf["body"]["target_lang"], "uk")
            self.assertIn('/accounts/'+('a'*32)+'/ai/run/@cf/meta/m2m100-1.2b', cf["path"])
            self.assertEqual(cf["headers"]["Authorization"], "Bearer [redacted]")
            gemini = rows["gemini-flash-lite-stream"]
            self.assertIn(':streamGenerateContent?alt=sse', gemini["path"])
            self.assertEqual(gemini["body"]["generationConfig"]["thinkingConfig"]["thinkingLevel"], "MINIMAL")
            self.assertEqual(gemini["headers"]["X-Goog-Api-Key"], "[redacted]")
            self.assertEqual(rows["cerebras-qwen-stream"]["body"]["model"], "qwen-3.8-27b")

    def test_gemini_stream_excludes_thought_parts_and_retains_finish_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "events.txt"
            events = [
                {"candidates": [{"content": {"parts": [{"thought": True, "text": "Reason"},
                                                         {"text": "Відкрийте "}]}}]},
                {"candidates": [{"content": {"parts": [{"text": "налаштування."}]},
                                  "finishReason": "STOP"}], "usageMetadata": {"candidatesTokenCount": 8}},
            ]
            fixture.write_text("\n\n".join("data: "+json.dumps(e) for e in events))
            result = subprocess.run([sys.executable, str(SCRIPT), "--parse-stream", str(fixture),
                                     "--stream-format", "gemini"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = json.loads(result.stdout)
            self.assertEqual(output["translation"], "Відкрийте налаштування.")
            self.assertEqual(output["finish_reason"], "STOP")
            self.assertEqual(output["reasoning_characters"], 6)

    def test_openai_stream_excludes_reasoning_and_accepts_final_usage_event(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "events.txt"
            events = [
                {"choices": [{"delta": {"reasoning_content": "Internal reasoning"}}]},
                {"choices": [{"delta": {"content": "Відкрийте "}}]},
                {"choices": [{"delta": {"content": "налаштування."}, "finish_reason": "stop"}]},
                {"choices": [], "usage": {"completion_tokens": 8}},
            ]
            fixture.write_text("\n\n".join("data: "+json.dumps(e) for e in events)+"\n\ndata: [DONE]\n")
            result = subprocess.run([sys.executable, str(SCRIPT), "--parse-stream", str(fixture),
                                     "--stream-format", "openai"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = json.loads(result.stdout)
            self.assertEqual(output["translation"], "Відкрийте налаштування.")
            self.assertEqual(output["finish_reason"], "stop")
            self.assertEqual(output["usage"]["completion_tokens"], 8)

    def test_new_providers_report_readiness_without_credentials(self):
        secret = "synthetic-cloud-provider-key"
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text(f"GROQ_API_KEY={secret}\nCLOUDFLARE_API_TOKEN={secret}\n"
                           f"CLOUDFLARE_ACCOUNT_ID={'a'*32}\nGEMINI_API_KEY={secret}\n"
                           f"CEREBRAS_API_KEY={secret}\n")
            result = subprocess.run([sys.executable, str(SCRIPT), "--env", str(env), "--check"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(secret, result.stdout + result.stderr)
            state = json.loads(result.stdout)["providers"]
            for provider in ("groq", "cloudflare", "gemini", "cerebras"):
                self.assertTrue(state[provider]["configured"])

    def test_check_reports_configuration_without_disclosing_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            secret = "synthetic-secret-do-not-log"
            env.write_text(
                f'AZURE_TRANSLATOR_KEY="{secret}"\n'
                "AZURE_TRANSLATOR_REGION=global\n"
                f"DEEPL_API_KEY={secret}\n"
                "COHERE_API_KEY=\n"
            )
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--env", str(env), "--check"],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(secret, result.stdout + result.stderr)
            state = json.loads(result.stdout)
            self.assertTrue(state["providers"]["azure"]["configured"])
            self.assertEqual(state["providers"]["azure"]["region"], "")
            self.assertFalse(state["providers"]["cohere"]["configured"])
            self.assertFalse(state["providers"]["google"]["configured"])

    def test_summary_keeps_failures_out_of_success_latency(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "results.json"
            fixture.write_text(json.dumps({"samples": [
                {"variant": "azure-auto", "phase": "warm", "ok": True,
                 "milliseconds": value, "connection_reused": True}
                for value in [10, 20, 30]
            ] + [{"variant": "azure-auto", "phase": "warm", "ok": False,
                  "milliseconds": 1, "status": 429}]}))
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--summarize", str(fixture)],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            summary = json.loads(result.stdout)["azure-auto"]["warm"]
            self.assertEqual(summary["successful"], 3)
            self.assertEqual(summary["failed"], 1)
            self.assertEqual(summary["median_ms"], 20)
            self.assertEqual(summary["p95_ms"], 30)

    def test_stream_accepts_done_marker_and_joins_text_deltas(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "events.txt"
            events = [
                {"type": "content-delta", "delta": {"message": {"content": {"text": "Відкрийте "}}}},
                {"type": "content-delta", "delta": {"message": {"content": {"text": "налаштування."}}}},
                {"type": "message-end", "delta": {"finish_reason": "COMPLETE"}},
            ]
            fixture.write_text("\n\n".join("data: " + json.dumps(x) for x in events) + "\n\ndata: [DONE]\n")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--parse-stream", str(fixture)],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            decoded = json.loads(result.stdout)
            self.assertEqual(decoded["translation"], "Відкрийте налаштування.")
            self.assertEqual(decoded["finish_reason"], "COMPLETE")

    def test_no_configured_keys_produces_report_without_network_or_crash(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("# No credentials\n")
            output = Path(directory) / "results.json"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--env", str(env), "--rounds", "1", "--output", str(output)],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output.read_text())
            self.assertEqual(report["samples"], [])
            self.assertEqual(report["summary"], {})


if __name__ == "__main__":
    unittest.main()
