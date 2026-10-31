# Chrome Web Store checklist

Status: preparation only. Nothing has been submitted.

## Still needed from the owner

- [ ] Operator name and a contact email (dashboard requirement; also goes in
      [PRIVACY.md](../PRIVACY.md)).
- [ ] A public URL for the privacy policy. The repository is private, so use a
      public page (for example a public GitHub Gist, a GitHub Pages site from a
      public repository, or a page on your own domain).
- [ ] A Chrome Web Store developer account (one-time registration fee).
- [ ] Store screenshots (1280×800 or 640×400) and a 440×280 promo tile.

## Before the first upload

1. Upload the ZIP once as a draft to get the store's extension ID.
2. Add `chrome-extension://<store id>` to `ALLOWED_EXTENSION_ORIGINS` in
   `wrangler.jsonc` and run `bun run worker:deploy`. Without this, included
   Azure answers 403 for store installs (see [install](install.md)).
3. Do not put a `key` field in the uploaded manifest; the store manages the ID.

## Listing answers

**Single purpose:** translate text the user selects on a web page, in a small
popup next to the selection.

**Permission justifications:**

| Permission                                    | Why                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `storage`                                     | Saves settings, the user's API keys, usage counts, and hidden sites locally |
| Content script on `http://*/*`, `https://*/*` | Shows the Translate button next to selected text on any page                |
| Host: `api.cognitive.microsofttranslator.com` | Sends translations with the user's own Azure key                            |
| Host: `api-free.deepl.com`, `api.deepl.com`   | Sends translations and allowance checks with the user's DeepL key           |
| Host: the Shvyd relay (`*.workers.dev`)       | Included Azure access without a key                                         |

**Remote code:** none. All scripts ship in the package.

**Data usage disclosures:**

- Website content: yes. The selected text is sent to the chosen translation
  provider when the user clicks Translate.
- Authentication information: yes. The user's own API keys are stored locally
  and sent only to that provider.
- Not collected: personal identity, health, financial, location, web history,
  user activity, personal communications.
- Certify: not sold, not used for unrelated purposes, not used for credit
  decisions.

**Privacy policy URL:** the public copy of [PRIVACY.md](../PRIVACY.md).
