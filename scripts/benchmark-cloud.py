#!/usr/bin/env python3
"""Reproducible, key-safe translation API benchmarks using Python's standard library."""
import argparse
import json
from pathlib import Path
import re
import shlex
import math
import statistics
import http.client
import html
import random
import time
import hashlib
from datetime import datetime, timezone
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = {
    "AZURE_TRANSLATOR_ENDPOINT": "https://api.cognitive.microsofttranslator.com",
    "AZURE_TRANSLATOR_REGION": "",
    "AZURE_TRANSLATOR_API_VERSION": "2026-06-06",
    "DEEPL_API_ENDPOINT": "https://api.deepl.com",
    "COHERE_API_ENDPOINT": "https://api.cohere.com",
    "COHERE_TRANSLATION_MODEL": "north-small-translate-09-2026",
    "COHERE_FAST_MODEL": "command-r7b-12-2024",
    "GOOGLE_TRANSLATE_ENDPOINT": "https://translation.googleapis.com",
    "GROQ_API_ENDPOINT": "https://api.groq.com",
    "GROQ_TRANSLATION_MODEL": "qwen/qwen3.8-27b",
    "GROQ_MAX_OUTPUT_TOKENS": "1000",
    "CLOUDFLARE_API_ENDPOINT": "https://api.cloudflare.com",
    "CLOUDFLARE_TRANSLATION_MODEL": "@cf/meta/m2m100-1.2b",
    "GEMINI_API_ENDPOINT": "https://generativelanguage.googleapis.com",
    "GEMINI_TRANSLATION_MODEL": "gemini-3.1-flash-lite",
    "CEREBRAS_API_ENDPOINT": "https://api.cerebras.ai",
    "CEREBRAS_TRANSLATION_MODEL": "qwen-3.8-27b",
}


def load_env(path):
    values = dict(DEFAULTS)
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.removeprefix("export ")
        if "=" not in line:
            raise ValueError(f"Invalid .env assignment on line {number}; value withheld")
        name, value = line.split("=", 1)
        name, value = name.strip(), value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError(f"Invalid .env name on line {number}; value withheld")
        if value.startswith(("'", '"')):
            parts = shlex.split(value, comments=True)
            value = parts[0] if parts else ""
        values[name] = value
    if values.get("AZURE_TRANSLATOR_REGION", "").lower() == "global":
        values["AZURE_TRANSLATOR_REGION"] = ""
    return values


def public_config(values):
    return {"providers": {
        "azure": {"configured": bool(values.get("AZURE_TRANSLATOR_KEY")),
                  "region": values["AZURE_TRANSLATOR_REGION"],
                  "endpoint": values["AZURE_TRANSLATOR_ENDPOINT"],
                  "api_version": values["AZURE_TRANSLATOR_API_VERSION"]},
        "deepl": {"configured": bool(values.get("DEEPL_API_KEY")),
                  "endpoint": values["DEEPL_API_ENDPOINT"]},
        "cohere": {"configured": bool(values.get("COHERE_API_KEY")),
                   "endpoint": values["COHERE_API_ENDPOINT"],
                   "model": values["COHERE_TRANSLATION_MODEL"]},
        "google": {"configured": bool(values.get("GOOGLE_TRANSLATE_API_KEY")),
                   "endpoint": values["GOOGLE_TRANSLATE_ENDPOINT"]},
        **{provider: {"configured": bool(values.get(key)), "endpoint": values[endpoint],
                      "model": values[model]}
           for provider, key, endpoint, model in (
               ("groq", "GROQ_API_KEY", "GROQ_API_ENDPOINT", "GROQ_TRANSLATION_MODEL"),
               ("gemini", "GEMINI_API_KEY", "GEMINI_API_ENDPOINT", "GEMINI_TRANSLATION_MODEL"),
               ("cerebras", "CEREBRAS_API_KEY", "CEREBRAS_API_ENDPOINT", "CEREBRAS_TRANSLATION_MODEL"))},
        "cloudflare": {"configured": bool(values.get("CLOUDFLARE_API_TOKEN") and values.get("CLOUDFLARE_ACCOUNT_ID")),
                       "endpoint": values["CLOUDFLARE_API_ENDPOINT"], "model": values["CLOUDFLARE_TRANSLATION_MODEL"],
                       "token_present": bool(values.get("CLOUDFLARE_API_TOKEN")),
                       "account_id_present": bool(values.get("CLOUDFLARE_ACCOUNT_ID"))},
    }}


def summarize(samples):
    groups = {}
    for sample in samples:
        groups.setdefault(sample["variant"], {}).setdefault(sample["phase"], []).append(sample)
    output = {}
    for variant, phases in groups.items():
        output[variant] = {}
        for phase, rows in phases.items():
            successful = [row for row in rows if row.get("ok")]
            durations = sorted(row["milliseconds"] for row in successful)
            entry = {"attempted": len(rows), "successful": len(successful),
                     "failed": len(rows) - len(successful)}
            if durations:
                entry.update(median_ms=round(statistics.median(durations), 2),
                             p95_ms=round(durations[math.ceil(.95 * len(durations)) - 1], 2),
                             min_ms=round(durations[0], 2), max_ms=round(durations[-1], 2),
                             reused_connections=sum(row.get("connection_reused", False) for row in successful))
                first = [row["first_text_ms"] for row in successful if row.get("first_text_ms") is not None]
                if first:
                    first.sort()
                    entry["first_text_median_ms"] = round(statistics.median(first), 2)
                    entry["first_text_p95_ms"] = round(first[math.ceil(.95 * len(first)) - 1], 2)
            output[variant][phase] = entry
    return output


def redact(value, config):
    encoded = json.dumps(value, ensure_ascii=False)
    for name, secret in config.items():
        if name.endswith(("_KEY", "_TOKEN")) and secret:
            encoded = encoded.replace(secret, "[redacted]")
    return json.loads(encoded)


def stream_event(line):
    if isinstance(line, bytes):
        line = line.decode("utf-8")
    if not line.startswith("data:"):
        return None
    payload = line[5:].strip()
    if not payload or payload == "[DONE]":
        return None
    return json.loads(payload)


def stream_state():
    return {"translation": "", "finish_reason": None, "usage": None, "reasoning_characters": 0}


def accept_stream_event(state, event, format):
    visible = ""
    if event.get("error"):
        state["stream_error"] = event["error"]
    if format == "openai":
        state["usage"] = event.get("usage") or event.get("x_groq", {}).get("usage") or state["usage"]
        for choice in event.get("choices", []):
            delta = choice.get("delta", {})
            visible += delta.get("content") or ""
            state["reasoning_characters"] += len(delta.get("reasoning_content") or delta.get("reasoning") or "")
            state["finish_reason"] = choice.get("finish_reason") or state["finish_reason"]
    elif format == "gemini":
        state["usage"] = event.get("usageMetadata") or state["usage"]
        for candidate in event.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if part.get("thought"):
                    state["reasoning_characters"] += len(part.get("text", ""))
                else:
                    visible += part.get("text", "")
            state["finish_reason"] = candidate.get("finishReason") or state["finish_reason"]
        if event.get("promptFeedback", {}).get("blockReason"):
            state["stream_error"] = event["promptFeedback"]
    elif event.get("type") == "content-delta":
        visible = event["delta"]["message"]["content"].get("text", "")
    elif event.get("type") == "message-end":
        state["finish_reason"] = event.get("delta", {}).get("finish_reason")
        state["usage"] = event.get("delta", {}).get("usage")
    elif event.get("type") == "error":
        state["stream_error"] = event
    state["translation"] += visible
    return visible


def parse_stream(lines, format="cohere"):
    state = stream_state()
    for line in lines:
        event = stream_event(line)
        if not event:
            continue
        accept_stream_event(state, event, format)
    return state


class Transport:
    """One persistent HTTP/1.1 TLS connection; no hidden retries or local caching."""
    ALLOWED_HOSTS = {"api.cognitive.microsofttranslator.com", "api.deepl.com",
                     "api-free.deepl.com", "api.cohere.com", "translation.googleapis.com",
                     "api.groq.com", "api.cloudflare.com", "generativelanguage.googleapis.com", "api.cerebras.ai"}

    def __init__(self, endpoint):
        parsed = urlsplit(endpoint.rstrip("/"))
        if (parsed.scheme != "https" or parsed.hostname not in self.ALLOWED_HOSTS
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.port not in (None, 443)):
            raise ValueError("Endpoint must be an official provider HTTPS URL")
        self.host = parsed.hostname
        self.base_path = parsed.path.rstrip("/")
        self.connection = None

    def close(self):
        if self.connection:
            self.connection.close()
        self.connection = None

    def request(self, path, headers, body=None, stream=False, method="POST"):
        start = time.perf_counter()
        output = {"started_at": datetime.now(timezone.utc).isoformat(), "ok": False,
                  "protocol": "HTTP/1.1", "first_text_ms": None}
        if not self.connection:
            self.connection = http.client.HTTPSConnection(self.host, timeout=30)
        previous_socket = self.connection.sock
        try:
            data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.connection.request(method, self.base_path + path, body=data,
                                    headers={"Content-Type": "application/json", **headers})
            response = self.connection.getresponse()
            output.update(status=response.status,
                          headers_ms=round((time.perf_counter() - start) * 1000, 3),
                          retry_after=response.getheader("Retry-After"))
            if stream and response.status == 200:
                state, events = stream_state(), 0
                format = stream if isinstance(stream, str) else "cohere"
                for line in response:
                    payload = stream_event(line)
                    if not payload:
                        continue
                    events += 1
                    text = accept_stream_event(state, payload, format)
                    if text and output["first_text_ms"] is None:
                        output["first_text_ms"] = round((time.perf_counter() - start) * 1000, 3)
                    if payload.get("model") or payload.get("modelVersion"):
                        output["returned_model"] = payload.get("model") or payload.get("modelVersion")
                output["response"] = {"message": {"content": [{"text": state["translation"]}]},
                                      "finish_reason": state["finish_reason"], "usage": state["usage"]}
                output["reasoning_characters"] = state["reasoning_characters"]
                if state.get("stream_error"):
                    output["stream_error"] = state["stream_error"]
                output["stream_events"] = events
            else:
                raw = response.read()
                try:
                    output["response"] = json.loads(raw)
                except (ValueError, UnicodeDecodeError):
                    output["error"] = "Response was not valid JSON; body withheld"
            output["connection_reused"] = previous_socket is not None and self.connection.sock is previous_socket
        except Exception as error:
            output["error"] = type(error).__name__
            self.close()
        output["milliseconds"] = round((time.perf_counter() - start) * 1000, 3)
        return output


def variants(config):
    output = []
    if config.get("AZURE_TRANSLATOR_KEY"):
        for detection in (False, True):
            output.append({"id": "azure-auto" if detection else "azure-en", "provider": "azure",
                           "endpoint": config["AZURE_TRANSLATOR_ENDPOINT"], "detect": detection})
    if config.get("DEEPL_API_KEY"):
        for mode in ("latency_optimized", "quality_optimized"):
            for detection in (False, True):
                output.append({"id": f"deepl-{mode}-{'auto' if detection else 'en'}",
                               "provider": "deepl", "endpoint": config["DEEPL_API_ENDPOINT"],
                               "model": mode, "detect": detection})
    if config.get("COHERE_API_KEY"):
        for model, label in ((config["COHERE_TRANSLATION_MODEL"], "north"),
                             (config["COHERE_FAST_MODEL"], "r7b")):
            for streaming in (False, True):
                output.append({"id": f"cohere-{label}-{'stream' if streaming else 'complete'}",
                               "provider": "cohere", "endpoint": config["COHERE_API_ENDPOINT"],
                               "model": model, "stream": streaming, "detect": True})
    if config.get("GOOGLE_TRANSLATE_API_KEY"):
        for detection in (False, True):
            output.append({"id": "google-auto" if detection else "google-en", "provider": "google",
                           "endpoint": config["GOOGLE_TRANSLATE_ENDPOINT"], "detect": detection})
    for provider, key, endpoint, model, label in (
            ("groq", "GROQ_API_KEY", "GROQ_API_ENDPOINT", "GROQ_TRANSLATION_MODEL", "qwen"),
            ("gemini", "GEMINI_API_KEY", "GEMINI_API_ENDPOINT", "GEMINI_TRANSLATION_MODEL", "flash-lite"),
            ("cerebras", "CEREBRAS_API_KEY", "CEREBRAS_API_ENDPOINT", "CEREBRAS_TRANSLATION_MODEL", "qwen")):
        if config.get(key):
            for streaming in (False, True):
                output.append({"id": f"{provider}-{label}-{'stream' if streaming else 'complete'}",
                               "provider": provider, "endpoint": config[endpoint], "model": config[model],
                               "stream": streaming, "detect": True})
    if config.get("CLOUDFLARE_API_TOKEN") and config.get("CLOUDFLARE_ACCOUNT_ID"):
        output.append({"id": "cloudflare-m2m100-en", "provider": "cloudflare",
                       "endpoint": config["CLOUDFLARE_API_ENDPOINT"], "model": config["CLOUDFLARE_TRANSLATION_MODEL"],
                       "detect": False})
    if config.get("GEMINI_API_KEY"):
        for model, thinking in (("gemini-3.5-flash-lite", "MINIMAL"), ("gemini-3.8-flash", "LOW")):
            for streaming in (False, True):
                output.append({"id": f"{model}-{'stream' if streaming else 'complete'}",
                               "provider": "gemini", "endpoint": config["GEMINI_API_ENDPOINT"],
                               "model": model, "thinking_level": thinking,
                               "stream": streaming, "detect": True})
    return output


def request_spec(variant, text, config):
    provider = variant["provider"]
    stream = False
    if provider == "azure":
        item = {"text": text, "targets": [{"language": "uk"}]}
        if not variant["detect"]:
            item["language"] = "en"
        headers = {"Ocp-Apim-Subscription-Key": config["AZURE_TRANSLATOR_KEY"]}
        if config["AZURE_TRANSLATOR_REGION"]:
            headers["Ocp-Apim-Subscription-Region"] = config["AZURE_TRANSLATOR_REGION"]
        path, body = "/translate?api-version=" + config["AZURE_TRANSLATOR_API_VERSION"], {"inputs": [item]}
    elif provider == "deepl":
        body = {"text": [text], "target_lang": "UK", "model_type": variant["model"],
                "show_billed_characters": True}
        if not variant["detect"]:
            body["source_lang"] = "EN"
        path, headers = "/v2/translate", {"Authorization": "DeepL-Auth-Key " + config["DEEPL_API_KEY"]}
    elif provider == "cohere":
        body = {"model": variant["model"], "temperature": 0,
                "max_tokens": min(4000, max(512, len(text))),
                "stream": variant["stream"], "messages": [{"role": "user", "content":
                "Translate everything that follows into Ukrainian. Return only the translation, without commentary:\n\n" + text}]}
        path, headers, stream = "/v2/chat", {"Authorization": "Bearer " + config["COHERE_API_KEY"]}, variant["stream"]
    elif provider in ("groq", "cerebras"):
        body = {"model": variant["model"], "temperature": 0, "stream": variant["stream"],
                "reasoning_effort": "none", "messages": [{"role": "user", "content":
                    "Translate everything that follows into Ukrainian. Return only the translation, without commentary:\n\n" + text}]}
        limit = min(4000, max(512, len(text)))
        if provider == "groq":
            ceiling = int(config["GROQ_MAX_OUTPUT_TOKENS"])
            if ceiling <= 0:
                raise ValueError("GROQ_MAX_OUTPUT_TOKENS must be positive")
            limit = min(limit, ceiling)
        body["max_completion_tokens" if provider == "groq" else "max_tokens"] = limit
        if variant["stream"]:
            body["stream_options"] = {"include_usage": True}
        path = "/openai/v1/chat/completions" if provider == "groq" else "/v1/chat/completions"
        headers = {"Authorization": "Bearer " + config[provider.upper()+"_API_KEY"]}
        stream = "openai" if variant["stream"] else False
    elif provider == "gemini":
        if not re.fullmatch(r"[A-Za-z0-9._-]+", variant["model"]):
            raise ValueError("Invalid Gemini model identifier")
        operation = "streamGenerateContent?alt=sse" if variant["stream"] else "generateContent"
        path = "/v1beta/models/" + variant["model"] + ":" + operation
        headers = {"X-Goog-Api-Key": config["GEMINI_API_KEY"]}
        body = {"contents": [{"role": "user", "parts": [{"text":
                    "Translate everything that follows into Ukrainian. Return only the translation, without commentary:\n\n" + text}]}],
                "generationConfig": {"temperature": 0, "maxOutputTokens": min(4000, max(512, len(text))),
                                     "thinkingConfig": {"thinkingLevel": variant.get("thinking_level", "MINIMAL")}}}
        stream = "gemini" if variant["stream"] else False
    elif provider == "cloudflare":
        account = config["CLOUDFLARE_ACCOUNT_ID"]
        if not re.fullmatch(r"[a-fA-F0-9]{32}", account):
            raise ValueError("CLOUDFLARE_ACCOUNT_ID must be the account's 32-character hexadecimal ID")
        path = "/client/v4/accounts/" + account + "/ai/run/" + variant["model"]
        headers = {"Authorization": "Bearer " + config["CLOUDFLARE_API_TOKEN"]}
        body = {"text": text, "source_lang": "en", "target_lang": "uk"}
    elif provider == "google":
        body = {"q": text, "target": "uk", "format": "text"}
        if not variant["detect"]:
            body["source"] = "en"
        path, headers = "/language/translate/v2", {"X-Goog-Api-Key": config["GOOGLE_TRANSLATE_API_KEY"]}
    else:
        raise ValueError("Unknown provider")
    return {"path": path, "headers": headers, "body": body, "stream": stream}


def translate(variant, text, transport, config):
    provider = variant["provider"]
    sample = transport.request(**request_spec(variant, text, config))
    sample.update(variant=variant["id"], text=text, characters=len(text))
    response = sample.pop("response", {})
    if sample.get("status") == 200:
        try:
            if provider == "azure":
                result = response["value"][0]
                sample["translation"] = result["translations"][0]["text"]
                sample["detected_language"] = result.get("detectedLanguage")
            elif provider == "deepl":
                result = response["translations"][0]
                sample["translation"] = result["text"]
                sample["detected_language"] = result.get("detected_source_language")
                sample["model_type_used"] = result.get("model_type_used")
                sample["billed_characters"] = result.get("billed_characters")
            elif provider == "cohere":
                sample["translation"] = "".join(item.get("text", "") for item in response["message"]["content"])
                sample["finish_reason"] = response.get("finish_reason")
                sample["usage"] = response.get("usage")
                if str(sample["finish_reason"]).upper() != "COMPLETE" or sample.get("stream_error"):
                    sample["error"] = "Generation did not complete"
            elif provider in ("groq", "cerebras", "gemini"):
                if variant["stream"]:
                    sample["translation"] = response["message"]["content"][0]["text"]
                    sample["finish_reason"] = response.get("finish_reason")
                    sample["usage"] = response.get("usage")
                elif provider == "gemini":
                    state = stream_state()
                    accept_stream_event(state, response, "gemini")
                    sample.update(state)
                else:
                    sample["translation"] = response["choices"][0]["message"].get("content", "")
                    sample["finish_reason"] = response["choices"][0].get("finish_reason")
                    sample["usage"] = response.get("usage")
                if str(sample["finish_reason"]).upper() != "STOP" or sample.get("stream_error"):
                    sample["error"] = "Generation did not complete"
            elif provider == "cloudflare":
                if not response.get("success"):
                    sample["error"] = "Cloudflare inference failed"
                    sample["provider_error"] = response.get("errors")
                sample["translation"] = response.get("result", {}).get("translated_text", "")
            elif provider == "google":
                result = response["data"]["translations"][0]
                sample["translation"] = html.unescape(result["translatedText"])
                sample["detected_language"] = result.get("detectedSourceLanguage")
            sample["ok"] = bool(sample["translation"].strip()) and not sample.get("error")
        except (KeyError, IndexError, TypeError):
            sample.setdefault("error", "Unexpected response schema")
    else:
        sample["provider_error"] = response
    return redact(sample, config)


def run_benchmark(args, config):
    input_path = args.inputs or ROOT / "docs/benchmarks/inputs-en-uk.json"
    inputs = json.loads(input_path.read_text())
    if not inputs:
        raise ValueError("The benchmark input set must not be empty")
    info = [{"id": f"core-{index + 1}", "size": "core", "text": item}
            if isinstance(item, str) else item for index, item in enumerate(inputs)]
    texts = [item["text"] for item in info]
    chosen = variants(config)
    if args.providers:
        chosen = [item for item in chosen if item["provider"] in args.providers.split(",")]
    if args.variants:
        chosen = [item for item in chosen if item["id"] in args.variants.split(",")]
    run_id = datetime.now(timezone.utc).strftime("cloud-%H%M%S")
    destination = args.output or ROOT / "docs/benchmarks" / datetime.now(timezone.utc).strftime("%Y-%m-%d") / run_id / "results.json"
    if destination.exists():
        raise ValueError("Output already exists; choose a new path to preserve previous runs")
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = {"metadata": {"started_at": datetime.now(timezone.utc).isoformat(),
                         "pair": "en->uk", "transport": "Python http.client HTTP/1.1",
                         "rounds": args.rounds, "seed": 42, "local_cache": False,
                         "measurement_mode": "smoke" if args.smoke_only else "repeated",
                         "input_file": str(input_path.relative_to(ROOT)) if input_path.is_relative_to(ROOT) else str(input_path),
                         "llm_output_limit": "max(512, source characters), capped at 4000 tokens; Groq also capped by GROQ_MAX_OUTPUT_TOKENS",
                         "groq_max_output_tokens": int(config["GROQ_MAX_OUTPUT_TOKENS"]),
                         "timing": "request start to entire response body; network included",
                         "cohere_minimum_start_interval_seconds": 3.2,
                         "deepl_minimum_start_interval_seconds": args.deepl_interval,
                         "new_provider_pacing": {"groq": "30 RPM and conservative 8000 TPM reservation",
                                                  "groq_output_tokens_per_minute": args.groq_output_tpm,
                                                  "gemini_minimum_seconds": args.gemini_interval,
                                                  "cerebras_minimum_seconds": 2.1,
                                                  "azure_characters_per_second": 500},
                         "harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                         "input_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
                         "configuration": public_config(config)},
            "inputs": info, "variants": chosen, "preflight": [], "samples": [], "blocked": [], "summary": {}}
    connections = {}
    last_start = {provider: 0 for provider in ("cohere", "deepl", "azure", "groq", "gemini", "cerebras", "cloudflare")}
    next_allowed = dict(last_start)
    stopped_providers = set()
    groq_budget = {"remaining": float(args.groq_output_tpm), "updated": time.monotonic()}

    def save():
        data["summary"] = summarize(data["samples"])
        destination.write_text(json.dumps(redact(data, config), ensure_ascii=False, indent=2) + "\n")

    def call(item, text, connection):
        provider = item["provider"]
        if provider in last_start:
            interval = {"cohere": 3.2, "deepl": args.deepl_interval,
                        "azure": max(.1, len(text)/500), "gemini": args.gemini_interval,
                        "cerebras": 2.1, "cloudflare": .1,
                        "groq": max(2.1, (len(text)/2+min(4000,max(512,len(text))))*60/8000)}[provider]
            delay = max(last_start[provider] + interval, next_allowed[provider]) - time.monotonic()
            if provider == "groq":
                now = time.monotonic()
                groq_budget["remaining"] = min(args.groq_output_tpm, groq_budget["remaining"] +
                                               (now - groq_budget["updated"]) * args.groq_output_tpm / 60)
                groq_budget["updated"] = now
                # Reserve the request's output ceiling. A single large response
                # can exceed the per-minute bucket, so wait for a full bucket
                # before it and carry its actual token debt into the next call.
                reservation = min(args.groq_output_tpm, int(config["GROQ_MAX_OUTPUT_TOKENS"]),
                                  min(4000, max(512, len(text))))
                output_delay = (reservation - groq_budget["remaining"]) * 60 / args.groq_output_tpm
                if output_delay > 0:
                    delay = max(delay, output_delay + 1)
            if delay > 0:
                time.sleep(delay)
            last_start[provider] = time.monotonic()
        sample = translate(item, text, connection, config)
        if provider == "groq" and sample.get("ok"):
            now = time.monotonic()
            groq_budget["remaining"] = min(args.groq_output_tpm, groq_budget["remaining"] +
                                           (now - groq_budget["updated"]) * args.groq_output_tpm / 60)
            generated = (sample.get("usage") or {}).get("completion_tokens")
            fallback = min(int(config["GROQ_MAX_OUTPUT_TOKENS"]), 4000, max(512, len(text)))
            groq_budget["remaining"] -= generated if generated is not None else fallback
            groq_budget["updated"] = now
        if provider in ("groq", "cloudflare", "gemini", "cerebras") and sample.get("status") in (401, 402, 403, 429):
            stopped_providers.add(provider)
            data["blocked"].append({"provider": provider, "reason": "Authentication, billing, or quota rejection; further requests stopped"})
        if sample.get("status") == 429 and provider in next_allowed and provider not in stopped_providers:
            retry_after = sample.get("retry_after")
            try:
                cooldown = min(60, max(30, float(retry_after)))
            except (TypeError, ValueError):
                cooldown = 30
            next_allowed[provider] = time.monotonic() + cooldown
            print(provider + ": HTTP 429, recording failure and waiting before the next request", flush=True)
        elif provider in stopped_providers:
            print(provider + ": authentication/billing/quota rejection, further requests stopped", flush=True)
        return sample

    try:
        # Non-translating endpoint validation, including trial keys on either DeepL host.
        if config.get("DEEPL_API_KEY") and any(item["provider"] == "deepl" for item in chosen):
            found = False
            endpoints = list(dict.fromkeys([config["DEEPL_API_ENDPOINT"], "https://api.deepl.com", "https://api-free.deepl.com"]))
            for endpoint in endpoints:
                connection = Transport(endpoint)
                result = connection.request("/v2/usage", {"Authorization": "DeepL-Auth-Key " + config["DEEPL_API_KEY"]}, method="GET")
                connection.close()
                data["preflight"].append(redact({"provider": "deepl", "endpoint": endpoint, **result}, config))
                if result.get("status") == 200:
                    config["DEEPL_API_ENDPOINT"] = endpoint
                    for item in chosen:
                        if item["provider"] == "deepl":
                            item["endpoint"] = endpoint
                    found = True
                    print("DeepL authenticated at " + endpoint, flush=True)
                    break
            if not found:
                limited = any(item.get("status") == 429 for item in data["preflight"])
                data["blocked"].append({"provider": "deepl", "reason": "Endpoint validation was rate limited" if limited else "All official usage endpoints rejected the key"})
                chosen = [item for item in chosen if item["provider"] != "deepl"]
        if not config.get("GOOGLE_TRANSLATE_API_KEY"):
            data["blocked"].append({"provider": "google", "reason": "No Google Cloud Translation API key configured"})
        active = []
        for item in chosen:
            if item["provider"] in stopped_providers:
                continue
            connection = Transport(item["endpoint"])
            sample = call(item, texts[1], connection)
            sample.update(phase="cold-first", round=-1)
            data["samples"].append(sample)
            if sample["ok"]:
                active.append(item)
                connections[item["id"]] = connection
                print(item["id"] + ": ready", flush=True)
            else:
                connection.close()
                data["blocked"].append({"variant": item["id"], "reason": sample.get("provider_error", sample.get("error"))})
                print(item["id"] + ": blocked, HTTP " + str(sample.get("status")), flush=True)
            save()
        rng = random.Random(42)
        for round_number in range(0 if args.smoke_only else args.rounds):
            tasks = [(item, index, text) for item in active for index, text in enumerate(texts)]
            rng.shuffle(tasks)
            failures = {}
            for item, index, text in tasks:
                if item["provider"] in stopped_providers or failures.get(item["id"], 0) >= 3:
                    continue
                sample = call(item, text, connections[item["id"]])
                sample.update(phase="warm", round=round_number, input_index=index)
                sample.update(input_id=info[index]["id"], size=info[index]["size"])
                data["samples"].append(sample)
                if not sample["ok"]:
                    failures[item["id"]] = failures.get(item["id"], 0) + 1
                save()
            progress = {variant: phases.get("warm") for variant, phases in data["summary"].items()}
            print(json.dumps({"round_complete": round_number + 1, "summary": progress}), flush=True)
        # Representative fresh requests are separate from the 60-sample warm distribution.
        for item in ([] if args.smoke_only else active):
            if item["provider"] in stopped_providers:
                continue
            for index in sorted(set([min(1, len(texts)-1), len(texts)//2, len(texts)-1])):
                if item["provider"] in stopped_providers:
                    break
                connection = Transport(item["endpoint"])
                sample = call(item, texts[index], connection)
                connection.close()
                sample.update(phase="fresh", round=-1, input_index=index)
                sample.update(input_id=info[index]["id"], size=info[index]["size"])
                data["samples"].append(sample)
                save()
        data["metadata"]["finished_at"] = datetime.now(timezone.utc).isoformat()
        data["metadata"]["configuration"] = public_config(config)
        save()
        print("Saved " + str(destination), flush=True)
    finally:
        for connection in connections.values():
            connection.close()
        save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, default=ROOT / ".env")
    parser.add_argument("--check", action="store_true", help="Print configuration status, never keys")
    parser.add_argument("--dry-run", action="store_true", help="Preview redacted request payloads without network calls")
    parser.add_argument("--smoke-only", action="store_true", help="One initial request per selected variant, without repeated or fresh requests")
    parser.add_argument("--summarize", type=Path, help="Summarize an existing results JSON without network calls")
    parser.add_argument("--parse-stream", type=Path, help="Decode an SSE fixture without network calls")
    parser.add_argument("--stream-format", choices=("cohere", "openai", "gemini"), default="cohere")
    parser.add_argument("--providers", help="Comma-separated provider names; default is every configured provider")
    parser.add_argument("--variants", help="Comma-separated variant IDs, to run a focused comparison")
    parser.add_argument("--inputs", type=Path, help="JSON array of texts or objects with id, size, and text")
    parser.add_argument("--rounds", type=int, default=5)
    parser.add_argument("--deepl-interval", type=float, default=2.0,
                        help="Minimum seconds between DeepL translation starts; waiting is outside request latency")
    parser.add_argument("--gemini-interval", type=float, default=15.0,
                        help="Minimum seconds between Gemini starts; adjust to the account's actual free quota")
    parser.add_argument("--groq-output-tpm", type=int, default=1000,
                        help="Separate Groq output-token/minute limit; confirm the account's quota")
    parser.add_argument("--output", type=Path, help="New results JSON path; existing results are never overwritten")
    args = parser.parse_args()
    if args.summarize:
        print(json.dumps(summarize(json.loads(args.summarize.read_text())["samples"]), indent=2))
        return
    if args.parse_stream:
        print(json.dumps(parse_stream(args.parse_stream.read_text().splitlines(), args.stream_format), ensure_ascii=False))
        return
    values = load_env(args.env)
    if args.check:
        print(json.dumps(public_config(values), indent=2))
        return
    if args.dry_run:
        chosen = variants(values)
        if args.providers:
            chosen = [item for item in chosen if item["provider"] in args.providers.split(",")]
        if args.variants:
            chosen = [item for item in chosen if item["id"] in args.variants.split(",")]
        inputs = json.loads(args.inputs.read_text()) if args.inputs else ["Open the settings."]
        texts = [item if isinstance(item, str) else item["text"] for item in inputs]
        rows = [{"variant": item["id"], "endpoint": item["endpoint"], **request_spec(item, text, values)}
                for item in chosen for text in texts]
        print(json.dumps(redact(rows, values), indent=2))
        return
    if args.rounds < 1 or args.rounds > 10:
        parser.error("--rounds must be between 1 and 10")
    if args.deepl_interval < 0:
        parser.error("--deepl-interval must be nonnegative")
    if args.gemini_interval < 0:
        parser.error("--gemini-interval must be nonnegative")
    if args.groq_output_tpm <= 0:
        parser.error("--groq-output-tpm must be positive")
    run_benchmark(args, values)


if __name__ == "__main__":
    main()
