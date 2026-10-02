#!/usr/bin/env python3
"""Internal translation experiment through the documented OpenCode Go API."""
import argparse
import importlib.util
import hashlib
import http.client
import json
from pathlib import Path
import random
import time
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("cloud_benchmark", ROOT / "scripts/benchmark-cloud.py")
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)
MODELS = {
    "mimo-v2.6-flash": {"thinking": {"type": "disabled"}},
    "glm-5.3-flash": {"thinking": {"type": "enabled"}, "reasoning_effort": "low"},
}
ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions"


def accept_event(state, event):
    if event.get("error"):
        state["stream_error"] = event["error"]
    if event.get("usage"):
        state["usage"] = event["usage"]
    if event.get("model"):
        state["returned_model"] = event["model"]
    visible = ""
    for choice in event.get("choices", []):
        delta = choice.get("delta", {})
        text = delta.get("content") or ""
        if not isinstance(text, str):
            raise ValueError("Unexpected content schema")
        visible += text
        state["translation"] += text
        reasoning = delta.get("reasoning_content") or delta.get("reasoning") or ""
        state["reasoning_characters"] += len(reasoning)
        if choice.get("finish_reason"):
            state["finish_reason"] = choice["finish_reason"]
    return visible


def new_stream():
    return {"translation": "", "reasoning_characters": 0, "finish_reason": None, "usage": None}


def parse_stream(lines):
    state = new_stream()
    for line in lines:
        event = cloud.stream_event(line)
        if event:
            accept_event(state, event)
    return state


class GoTransport:
    def __init__(self, route="go"):
        self.connection = None
        self.route = route

    def close(self):
        if self.connection:
            self.connection.close()
        self.connection = None

    def translate(self, model, text, key, session_id):
        start = time.perf_counter()
        output = {"started_at": datetime.now(timezone.utc).isoformat(), "ok": False,
                  "first_text_ms": None, "protocol": "HTTP/1.1", **new_stream()}
        if self.connection is None:
            self.connection = http.client.HTTPSConnection("opencode.ai", timeout=30)
        previous_socket = self.connection.sock
        wire_model = model + "-free" if self.route == "zen-free" else model
        body = {"model": wire_model, "stream": True, "stream_options": {"include_usage": True},
                "temperature": 0, "max_tokens": 4096,
                "messages": [{"role": "user", "content":
                    "Translate everything that follows into Ukrainian. Return only the translation, without commentary:\n\n" + text}],
                **MODELS[model]}
        try:
            path = "/zen/v1/chat/completions" if self.route == "zen-free" else "/zen/go/v1/chat/completions"
            self.connection.request("POST", path,
                json.dumps(body, ensure_ascii=False).encode("utf-8"),
                {"Content-Type": "application/json", "Authorization": "Bearer " + key,
                 "User-Agent": "shvyd-translation-benchmark/1.0", "x-opencode-session": session_id})
            response = self.connection.getresponse()
            output.update(status=response.status, headers_ms=round((time.perf_counter()-start)*1000, 3))
            if response.status == 200:
                for line in response:
                    if time.perf_counter()-start > 90:
                        raise TimeoutError("Request duration limit")
                    event = cloud.stream_event(line)
                    if event:
                        visible = accept_event(output, event)
                        if visible and output["first_text_ms"] is None:
                            output["first_text_ms"] = round((time.perf_counter()-start)*1000, 3)
                output["ok"] = (bool(output["translation"].strip())
                                and output["finish_reason"] == "stop"
                                and not output.get("stream_error"))
                if not output["ok"]:
                    output["error"] = "Generation was empty, truncated, or failed"
            else:
                raw = response.read()
                try:
                    output["provider_error"] = json.loads(raw)
                except (ValueError, UnicodeDecodeError):
                    output["error"] = "Non-JSON error body withheld"
            output["connection_reused"] = previous_socket is not None and self.connection.sock is previous_socket
        except Exception as error:
            output["ok"] = False
            output["error"] = type(error).__name__
            self.close()
        output["milliseconds"] = round((time.perf_counter()-start)*1000, 3)
        return output


def run(args, config, models):
    inputs = json.loads(args.inputs.read_text())
    if not inputs:
        raise ValueError("Inputs must not be empty")
    prefix = args.route + "-"
    variants = [prefix + model for model in models] if config.get("OPENCODE_GO_API_KEY") else []
    if args.with_azure and config.get("AZURE_TRANSLATOR_KEY"):
        variants.append("azure-auto")
    stamp = datetime.now(timezone.utc)
    destination = args.output or ROOT / "docs/benchmarks" / stamp.strftime("%Y-%m-%d") / (args.route + stamp.strftime("-%H%M%S")) / "results.json"
    if destination.exists():
        raise ValueError("Output exists; choose a new path")
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = {"metadata": {"started_at": stamp.isoformat(), "pair": "en->uk", "rounds": args.rounds,
              "endpoint": ENDPOINT if args.route == "go" else "https://opencode.ai/zen/v1/chat/completions",
              "route": args.route,
              "wire_models": [model + "-free" if args.route == "zen-free" else model for model in models],
              "models": {model: MODELS[model] for model in models},
              "purpose": "Internal model evaluation; Go documents coding-agent traffic, not a general translation service",
              "transport": "Python http.client HTTP/1.1", "one_request_at_a_time": True,
              "local_cache": False, "provider_caching": "uncontrolled; session stable for each input across rounds",
              "retries": 0, "seed": 42, "go_minimum_start_interval_seconds": 2,
              "max_tokens": 4096, "temperature": 0,
              "input_file": str(args.inputs.relative_to(ROOT)) if args.inputs.is_relative_to(ROOT) else str(args.inputs),
              "input_sha256": hashlib.sha256(args.inputs.read_bytes()).hexdigest(),
              "harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
            "inputs": inputs, "samples": [], "summary": {}, "blocked": []}
    if not config.get("OPENCODE_GO_API_KEY"):
        data["blocked"].append({"provider": "opencode-go", "reason": "No key configured"})
    connections = {variant: cloud.Transport(config["AZURE_TRANSLATOR_ENDPOINT"])
                   if variant == "azure-auto" else GoTransport(args.route) for variant in variants}
    run_id = uuid.uuid4()
    sessions = {item["id"]: str(uuid.uuid5(run_id, item["id"])) for item in inputs}
    last_go_start = 0

    def save():
        data["summary"] = cloud.summarize(data["samples"])
        destination.write_text(json.dumps(cloud.redact(data, config), ensure_ascii=False, indent=2)+"\n")

    def call(variant, item, phase, round_number):
        nonlocal last_go_start
        if variant == "azure-auto":
            sample = cloud.translate({"id": variant, "provider": "azure", "detect": True},
                                     item["text"], connections[variant], config)
        else:
            delay = last_go_start+2-time.monotonic()
            if delay > 0:
                time.sleep(delay)
            last_go_start = time.monotonic()
            sample = connections[variant].translate(variant.removeprefix(prefix), item["text"],
                                                   config["OPENCODE_GO_API_KEY"], sessions[item["id"]])
        sample.update(variant=variant, text=item["text"], characters=len(item["text"]),
                      input_id=item["id"], size=item["size"], phase=phase, round=round_number)
        data["samples"].append(sample)
        save()
        return sample

    try:
        active = []
        for variant in variants:
            sample = call(variant, inputs[min(3, len(inputs)-1)], "cold-first", -1)
            print(json.dumps({"variant": variant, "phase": "cold-first", "ok": sample["ok"],
                              "status": sample.get("status"), "milliseconds": sample["milliseconds"]}), flush=True)
            if sample["ok"]:
                active.append(variant)
            else:
                data["blocked"].append({"variant": variant, "reason": sample.get("provider_error", sample.get("error"))})
        if not any(variant.startswith(prefix) for variant in active):
            # A control-only run cannot answer the Go comparison question.
            active = []
        rng = random.Random(42)
        blocked = set()
        for round_number in range(args.rounds):
            tasks = [(variant, item) for variant in active if variant not in blocked for item in inputs]
            rng.shuffle(tasks)
            failures = {}
            for variant, item in tasks:
                if variant in blocked:
                    continue
                sample = call(variant, item, "warm", round_number)
                if not sample["ok"]:
                    failures[variant] = failures.get(variant, 0)+1
                    if sample.get("status") in (401, 402, 403, 429) or failures[variant] >= 3:
                        blocked.add(variant)
                        data["blocked"].append({"variant": variant, "reason": "Stop after credential/quota failure or three request failures"})
                print(json.dumps({"variant": variant, "input": item["id"], "round": round_number+1,
                                  "ok": sample["ok"], "status": sample.get("status"),
                                  "first_text_ms": sample.get("first_text_ms"),
                                  "milliseconds": sample["milliseconds"]}), flush=True)
        data["metadata"]["completed_at"] = datetime.now(timezone.utc).isoformat()
        data["metadata"]["comparison_complete"] = (
            not data["blocked"] and bool(models)
            and all(sum(s["phase"] == "warm" and s["variant"] == prefix+model
                        and s["ok"] for s in data["samples"]) == len(inputs)*args.rounds for model in models))
    finally:
        for connection in connections.values():
            connection.close()
        save()
    print("Saved " + str(destination), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parse-stream", type=Path)
    parser.add_argument("--env", type=Path, default=ROOT / ".env")
    parser.add_argument("--auth-file", type=Path, help="Optional OpenCode auth.json; only its opencode-go API key is read")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--inputs", type=Path, default=ROOT / "docs/benchmarks/inputs-realistic-en-uk.json")
    parser.add_argument("--route", choices=("go", "zen-free"), default="go")
    parser.add_argument("--models", help="Comma-separated model IDs")
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--with-azure", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.parse_stream:
        print(json.dumps(parse_stream(args.parse_stream.read_text().splitlines()), ensure_ascii=False))
        return
    config = cloud.load_env(args.env)
    if not config.get("OPENCODE_GO_API_KEY") and args.auth_file:
        selected = json.loads(args.auth_file.read_text()).get("opencode-go", {})
        if selected.get("type") == "api":
            config["OPENCODE_GO_API_KEY"] = selected.get("key", "")
    models = (args.models or ("mimo-v2.6-flash" if args.route == "zen-free" else ",".join(MODELS))).split(",")
    if args.route == "zen-free" and models != ["mimo-v2.6-flash"]:
        parser.error("zen-free only supports the published free MiMo model")
    if any(model not in MODELS for model in models):
        parser.error("Unsupported model; supported: " + ", ".join(MODELS))
    if not 1 <= args.rounds <= 10:
        parser.error("--rounds must be between 1 and 10")
    if args.check:
        print(json.dumps({"go_configured": bool(config.get("OPENCODE_GO_API_KEY")),
                          "azure_configured": bool(config.get("AZURE_TRANSLATOR_KEY")),
                          "endpoint": ENDPOINT if args.route == "go" else "https://opencode.ai/zen/v1/chat/completions",
                          "models": [model+"-free" if args.route == "zen-free" else model for model in models]}))
        return
    run(args, config, models)


if __name__ == "__main__":
    main()
