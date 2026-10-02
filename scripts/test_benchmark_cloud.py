"""Exercise the benchmark CLI without real credentials or network requests."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("benchmark-cloud.py")


class BenchmarkCliTests(unittest.TestCase):
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
