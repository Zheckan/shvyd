# Translation API keys

Paste credentials into the project's `.env` file. It is excluded by `.gitignore` and has file permissions `0600`. Leave unused providers empty. Tell the agent which providers are ready; the key values do not need to be sent in chat. `.env.example` contains the same variable names and public defaults without credentials.

You can edit `.env` directly or run the optional guided setup from the project directory:

```sh
bash scripts/setup-api-keys.sh
```

The helper opens provider dashboards, accepts hidden key input, and writes values into `.env`. Each provider can be skipped. The helper has been checked with `bash -n`; it has not been run through account creation.

## Azure Translator

1. Sign in at the [Azure portal](https://portal.azure.com/) with an active Azure subscription.
2. Create the resource group separately under Resource groups -> Create. Name it `shvyd` and select a geographic location, such as Poland Central. A resource group cannot use Global.
3. Search for Translator and create a single-service Translator resource. Select the existing `shvyd` group, choose a resource name, **Global** resource region, and the **F0 free** pricing tier. If the group appears as `(New) shvyd`, finish creating it separately first.
4. Choose Review + Create, then Create. After deployment, choose Go to resource.
5. Open Resource Management -> Keys and Endpoint. Copy Key 1 or Key 2 into `AZURE_TRANSLATOR_KEY`.
6. Leave `AZURE_TRANSLATOR_REGION` empty for Global. For a regional resource, enter its region code. Use the **Text Translation** endpoint, `https://api.cognitive.microsofttranslator.com`. The resource-group location does not go into this variable.

The F0 Translator allowance is 2 million characters per month. Creating an Azure account may require phone and payment-method verification. The introductory account trial and the Translator F0 tier have different lifetimes; the account must remain active after the introductory trial.

References: [resource creation and keys](https://learn.microsoft.com/en-us/azure/ai-services/translator/how-to/create-translator-resource), [Translator pricing](https://azure.microsoft.com/en-us/pricing/details/translator/), [Azure account options](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account).

## DeepL

1. Open [DeepL for developers](https://www.deepl.com/en/developers) and select the free **API Developer** plan. An API account is required.
2. Open the account's API Keys & Limits tab.
3. Create an active API key if needed, then use the copy icon beside it.
4. Paste only the key into `DEEPL_API_KEY`, without labels or copied delimiters. The benchmark verifies whether the key uses `api.deepl.com` or `api-free.deepl.com` with the non-translating `/v2/usage` operation before sending translation requests. This project's configured account authenticated at `https://api-free.deepl.com` on 2026-10-02 and reported a 1,000,000-character limit.

New API Developer accounts have a total free allowance of 1 million characters. It does not reset monthly. The legacy API Free plan is closed to new subscriptions. DeepL's generic quickstart still refers to `api-free.deepl.com` for free plans, so endpoint verification is part of benchmark setup.

References: [API plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans), [creating and copying keys](https://support.deepl.com/hc/en-us/articles/360020695820-API-key-for-DeepL-API), [quickstart](https://developers.deepl.com/docs/getting-started/quickstart).

## Cohere

1. Create an account at the [Cohere dashboard](https://dashboard.cohere.com/).
2. Open API Keys and copy the trial key provided after registration.
3. Paste it into `COHERE_API_KEY`.

The trial key allows 1,000 API calls per month. The translation model is North Small Translate, which Cohere currently offers free within applicable limits. Production access and limits are separate from the trial. On 2026-10-02, the documentation's `north-small-translate-1-0` ID returned HTTP 404 for this account. The authenticated `/v1/models` list exposed `north-small-translate-09-2026`, which successfully translated text. The local configuration uses that verified ID. `COHERE_FAST_MODEL=command-r7b-12-2024` adds a smaller general-purpose LLM comparison.

References: [trial keys](https://docs.cohere.com/docs/going-live), [rate limits](https://docs.cohere.com/docs/rate-limits), [North Small Translate](https://docs.cohere.com/docs/north-small-translate-1.0).

## Google Cloud Translation

Google is skipped for the current comparison at the user's request because the account setup requested a payment. Keep its key empty. The optional instructions below are retained for a future comparison.

This is Google's official programmatic translation service. The benchmark uses **Cloud Translation Basic v2 with its NMT model**, a traditional dedicated translation API. It does not use Google's optional Translation LLM.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create or select a project.
2. Link an active billing account to the project. Google's NMT allowance covers the first 500,000 characters per month through a $10 monthly credit, but billing must still be enabled.
3. Enable **Cloud Translation API** for that project.
4. Open APIs & Services -> Credentials -> Create credentials -> API key. Restrict the key to Cloud Translation API. This command-line benchmark needs a key that accepts server requests; a browser HTTP-referrer restriction does not match it.
5. Paste the key into `GOOGLE_TRANSLATE_API_KEY`. Keep `GOOGLE_TRANSLATE_ENDPOINT=https://translation.googleapis.com`.

The runner skips Google while its key is empty and includes fixed-source and automatic-detection variants once it is set. The Google Translate consumer website and Chrome's built-in offline Translator API are separate test targets.

References: [project setup and billing](https://docs.cloud.google.com/translate/docs/setup), [Basic v2 API-key support](https://docs.cloud.google.com/translate/docs/authentication#api-keys), [NMT pricing and monthly credit](https://cloud.google.com/products/translate/pricing), [v2 translate operation](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate).

## Run or repeat the cloud comparison

Setup for Groq, Cloudflare Workers AI, Gemini through AI Studio, and Cerebras is documented in [additional-providers.md](additional-providers.md). Their key fields and public model defaults are in `.env` and `.env.example`. All four have direct HTTPS adapters in the main runner. The earlier quota-limited OpenCode API experiment remains archived separately. OpenCode CLI inference is outside this comparison.

```sh
python3 scripts/benchmark-cloud.py --check
python3 scripts/test_benchmark_cloud.py
python3 scripts/benchmark-cloud.py
```

`--check` prints configuration status and public endpoints without keys. The benchmark saves each run in a new timestamped directory under `docs/benchmarks/YYYY-MM-DD/`. Use `--providers google`, `--providers deepl`, or `--variants cohere-north-stream` to run a focused comparison. It never replaces an existing result file.
