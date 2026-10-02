# Translation API keys

Paste credentials into the project's `.env` file. It is excluded by `.gitignore` and has file permissions `0600`. Leave unused providers empty. Tell the agent which providers are ready; the key values do not need to be sent in chat.

You can edit `.env` directly or run the optional guided setup from the project directory:

```sh
bash scripts/setup-api-keys.sh
```

The helper opens provider dashboards, accepts hidden key input, and writes values into `.env`. Each provider can be skipped. The helper has been checked with `bash -n`; it has not been run through account creation.

## Azure Translator

1. Sign in at the [Azure portal](https://portal.azure.com/) with an active Azure subscription.
2. Search for Translator and create a single-service Translator resource. Choose a resource group, a resource name, Global region, and the **F0 free** pricing tier.
3. Choose Review + Create, then Create. After deployment, choose Go to resource.
4. Open Resource Management -> Keys and Endpoint. Copy Key 1 or Key 2 into `AZURE_TRANSLATOR_KEY`.
5. Leave `AZURE_TRANSLATOR_REGION` empty for Global. For a regional resource, enter its region code. The global endpoint is already filled in.

The F0 Translator allowance is 2 million characters per month. Creating an Azure account may require phone and payment-method verification. The introductory account trial and the Translator F0 tier have different lifetimes; the account must remain active after the introductory trial.

References: [resource creation and keys](https://learn.microsoft.com/en-us/azure/ai-services/translator/how-to/create-translator-resource), [Translator pricing](https://azure.microsoft.com/en-us/pricing/details/translator/), [Azure account options](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account).

## DeepL

1. Open [DeepL for developers](https://www.deepl.com/en/developers) and select the free **API Developer** plan. An API account is required.
2. Open the account's API Keys & Limits tab.
3. Create an active API key if needed, then use the copy icon beside it.
4. Paste it into `DEEPL_API_KEY`. The benchmark will verify whether the key uses `api.deepl.com` or `api-free.deepl.com` before sending translation requests.

New API Developer accounts have a total free allowance of 1 million characters. It does not reset monthly. The legacy API Free plan is closed to new subscriptions. DeepL's generic quickstart still refers to `api-free.deepl.com` for free plans, so endpoint verification is part of benchmark setup.

References: [API plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans), [creating and copying keys](https://support.deepl.com/hc/en-us/articles/360020695820-API-key-for-DeepL-API), [quickstart](https://developers.deepl.com/docs/getting-started/quickstart).

## Cohere

1. Create an account at the [Cohere dashboard](https://dashboard.cohere.com/).
2. Open API Keys and copy the trial key provided after registration.
3. Paste it into `COHERE_API_KEY`.

The trial key allows 1,000 API calls per month. The model to compare is `north-small-translate-1-0`, which Cohere currently offers free within applicable limits. Production access and limits are separate from the trial.

References: [trial keys](https://docs.cohere.com/docs/going-live), [rate limits](https://docs.cohere.com/docs/rate-limits), [North Small Translate](https://docs.cohere.com/docs/north-small-translate-1.0).
