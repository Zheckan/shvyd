# Fast translation model research, 2026-10-02

The earlier Gemini benchmark used **gemini-3.1-flash-lite**, with MINIMAL thinking. The current official catalog and the configured account's live model listing also include **gemini-3.5-flash-lite** and **gemini-3.8-flash**. These are separate model IDs and should remain separate in future comparisons. Cerebras is excluded at the user's request.

The [live model discovery archive](model-discovery-212211/catalog.json) records the Gemini and OpenCode Go model listings. Both returned HTTP 200. The public Zen listing returned HTTP 403. A successful listing establishes model availability in the catalog, not generation access or latency.

## Candidates and settings

| Route / model | Why test it | Lowest requested reasoning setting | Published parameter count |
|---|---|---|---|
| Google / Gemini 3.5 Flash-Lite | Google describes it as its fastest, cost-efficient 3.5 model for high-throughput work, including translation | MINIMAL | Undisclosed in the documentation consulted |
| Google / Gemini 3.8 Flash | Latest Flash generation; tests whether newer Flash beats Lite for this task | LOW; MINIMAL is unsupported | Undisclosed in the documentation consulted |
| OpenCode Go / GLM-5.3 Flash | The user's fast Raycast proofreading model, tested through a different route | reasoning_effort=low; native Z.ai documentation says thinking cannot be disabled | 320B total, 18B activated |
| OpenCode Go / MiMo-V2.6 Flash | Efficient Flash model with optional thinking | thinking.type=disabled | 309B total, 15B activated |
| OpenCode Go / DeepSeek V4 Flash | Smallest of these models by published active decode parameter count | thinking.type=disabled plus reasoning_effort=none | 284B total, 13B activated |
| OpenCode Go / DeepSeek V4.1 Flash | Newer architecture with less prefill work and speculative decoding | thinking.type=disabled | 552B backbone, 8B activated during prefill / 16B during decode; additional 196B conditional memory |
| OpenCode Go / Qwen3.8 Flash | Fast commercial Qwen tier with thinking disabled | Anthropic thinking.type=disabled | Undisclosed for this commercial model ID in the documentation consulted |

The counts above describe the developers' published models. OpenCode's model IDs and returned model names do not reveal its exact weight revision, quantization, GPU hardware, queue, or inference provider. Qwen3.8 Flash is not the same identifier as the Qwen3.8 27B model tested through Groq. A Flash label does not establish that a model is small or has the shortest first-text latency.

## Raycast and Vercel

The user's Raycast screenshot labels GLM-5.3 Flash's provider as Vercel. Vercel's GLM page lists both Z.ai and Baseten as inference providers, and AI Gateway can select providers by time to first token or tokens per second. This supports treating Vercel as a routing layer; the screenshot alone does not establish which inference provider handled the user's request. We have no standalone Vercel API key, so this study does not measure Raycast's route.

OpenCode Go documents a different gateway, with a live model listing that identifies the models only as owned by opencode. Its documentation describes Go as intended for coding agents. These direct requests are an internal translation experiment; they do not establish that Go is supported as a translation extension's production service.

## Tiny open-weight model in the browser: opinion only

This is technically possible. WebLLM supports WebGPU inference, streaming, workers, and Chrome extension integration. A 0.5–1B model is the scale I would consider for a later experiment. For example, Qwen publishes a 0.8B language model and explicitly frames that size as useful for prototyping and task-specific research.

Even that scale is substantial for this extension. Four-bit storage alone is approximately 250–500 MB for 0.5–1B parameters, calculated as parameter count × 4 / 8 bytes. Actual artifacts can be larger due to quantization metadata and higher-precision tensors. Loaded GPU memory also includes caches, working buffers, and runtime overhead. Downloading cached weights and loading them into a GPU are separate steps; a browser restart or worker eviction can require another initialization even when the download is cached.

My expectation is that warm local inference could feel responsive on the user's M4 Pro and offer offline privacy, but Ukrainian translation quality, idioms, omission rates, battery use, and performance on weaker devices would need evaluation. I would keep this as an optional offline mode after the cloud prototype works. For the current goal of a lightweight extension that responds quickly with little setup, an API keeps the model footprint off the device. A dedicated local translation model remains another option where browser support and quality are adequate.

No browser LLM was installed, downloaded, or run for this opinion. There are no new local LLM timings or accuracy claims.

## Primary sources

- [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models), [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Gemini 3.8 Flash and its supported thinking levels](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking).
- [OpenCode Go model IDs, API formats, and client expectations](https://opencode.ai/docs/go/). Qwen uses /zen/go/v1/messages; the other shortlisted Go models use /zen/go/v1/chat/completions.
- [Z.ai GLM-5.3 Flash architecture and reasoning restrictions](https://docs.z.ai/guides/vlm/glm-5.3-flash).
- [Xiaomi's MiMo-V2.6 Flash model card](https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Flash-RL), [MiMo hyperparameters](https://mimo.mi.com/docs/en-US/api/guidance/model-hyperparameters).
- [DeepSeek V4 Flash model card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash), [DeepSeek V4.1 Flash model card](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash), [thinking modes](https://api-docs.deepseek.com/guides/thinking_mode).
- [Alibaba's Qwen3.8 Flash specification](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-flash), [Anthropic-compatible Messages API](https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages).
- [Vercel GLM-5.3 Flash providers and routing](https://vercel.com/ai-gateway/models/glm-5.3-flash). Its published provider timings are not measurements from this project.
- [WebLLM runtime](https://webllm.mlc.ai/docs/), [model loading and caching](https://webllm.mlc.ai/docs/user/basic_usage.html), [workers and Chrome extensions](https://webllm.mlc.ai/docs/user/advanced_usage.html), [Qwen 0.8B model card](https://huggingface.co/Qwen/Qwen3.5-0.8B).
