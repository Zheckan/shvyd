"""Check that streamed reasoning is never counted as translated text."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class GoStreamTests(unittest.TestCase):
    def test_qwen_uses_messages_endpoint_and_excludes_thinking_deltas(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("OPENCODE_GO_API_KEY=synthetic-secret\n")
            command = [sys.executable, str(Path(__file__).with_name("benchmark-opencode-go.py"))]
            result = subprocess.run(command + ["--env", str(env), "--dry-run", "--models", "qwen3.8-flash"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("synthetic-secret", result.stdout)
            request = json.loads(result.stdout)[0]
            self.assertEqual(request["path"], "/zen/go/v1/messages")
            self.assertEqual(request["headers"]["x-api-key"], "[redacted]")
            self.assertEqual(request["body"]["thinking"]["type"], "disabled")
            self.assertNotIn("stream_options", request["body"])
            events = [
                {"type": "message_start", "message": {"model": "qwen3.8-flash", "usage": {"input_tokens": 17, "output_tokens": 0}}},
                {"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "Think"}},
                {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Налаштування"}},
                {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 7}},
                {"type": "message_stop"},
            ]
            fixture = Path(directory) / "events.txt"
            fixture.write_text("\n\n".join("data: " + json.dumps(e) for e in events))
            result = subprocess.run(command + ["--parse-stream", str(fixture)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = json.loads(result.stdout)
            self.assertEqual(output["translation"], "Налаштування")
            self.assertEqual(output["reasoning_characters"], 5)
            self.assertEqual(output["finish_reason"], "end_turn")
            self.assertEqual(output["usage"], {"input_tokens": 17, "output_tokens": 7})

    def test_fast_chat_candidates_have_redacted_direct_api_previews(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("OPENCODE_GO_API_KEY=synthetic-secret\n")
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("benchmark-opencode-go.py")),
                 "--env", str(env), "--dry-run", "--models",
                 "glm-5.3-flash,mimo-v2.6-flash,deepseek-v4-flash,deepseek-v4.1-flash"],
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("synthetic-secret", result.stdout)
            rows = {row["body"]["model"]: row for row in json.loads(result.stdout)}
            self.assertEqual(len(rows), 4)
            for model, row in rows.items():
                self.assertEqual(row["path"], "/zen/go/v1/chat/completions")
                self.assertTrue(row["body"]["stream"])
                self.assertEqual(row["headers"]["Authorization"], "Bearer [redacted]")
                if model == "glm-5.3-flash":
                    self.assertNotIn("thinking", row["body"])
                    self.assertEqual(row["body"]["reasoning_effort"], "low")
                else:
                    self.assertEqual(row["body"]["thinking"]["type"], "disabled")
                    if model == "deepseek-v4-flash":
                        self.assertEqual(row["body"]["reasoning_effort"], "none")

    def test_free_route_rejects_models_that_would_require_paid_zen_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("# No key\n")
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("benchmark-opencode-go.py")),
                 "--route", "zen-free", "--models", "glm-5.3-flash", "--env", str(env), "--check"],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("only supports the published free MiMo model", result.stderr)

    def test_check_uses_only_selected_provider_and_never_prints_credentials(self):
        secret = "synthetic-private-go-key"
        with tempfile.TemporaryDirectory() as directory:
            auth = Path(directory) / "auth.json"
            auth.write_text(json.dumps({"opencode-go": {"type": "api", "key": secret},
                                        "unrelated": {"type": "api", "key": "not-selected"}}))
            env = Path(directory) / ".env"
            env.write_text("# No Azure key\n")
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("benchmark-opencode-go.py")),
                 "--auth-file", str(auth), "--env", str(env), "--check"],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(secret, result.stdout + result.stderr)
            self.assertNotIn("not-selected", result.stdout + result.stderr)
            self.assertTrue(json.loads(result.stdout)["go_configured"])

    def test_stream_joins_translation_and_keeps_reasoning_separate(self):
        events = [
            {"choices": [{"delta": {"reasoning_content": "Think first"}, "finish_reason": None}]},
            {"choices": [{"delta": {"content": "Відкрийте "}, "finish_reason": None}]},
            {"choices": [{"delta": {"content": "налаштування."}, "finish_reason": None}]},
            {"choices": [{"delta": {}, "finish_reason": "stop"}]},
            {"choices": [], "usage": {"prompt_tokens": 12, "completion_tokens": 8}},
        ]
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "events.txt"
            fixture.write_text("\n\n".join("data: " + json.dumps(e) for e in events)
                               + "\n\ndata: [DONE]\n")
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("benchmark-opencode-go.py")),
                 "--parse-stream", str(fixture)], capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            output = json.loads(result.stdout)
            self.assertEqual(output["translation"], "Відкрийте налаштування.")
            self.assertEqual(output["reasoning_characters"], 11)
            self.assertEqual(output["finish_reason"], "stop")
            self.assertEqual(output["usage"]["completion_tokens"], 8)


if __name__ == "__main__":
    unittest.main()
