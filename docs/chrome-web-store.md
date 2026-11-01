# Chrome Web Store checklist

Status: preparation only. Nothing has been submitted.

## Still needed from the owner

- [x] Operator name and a contact email: Yevhenii Zhaivoronok,
      Zheckan1120@gmail.com (also in [PRIVACY.md](../PRIVACY.md)).
- [ ] Make the repository public, so the privacy policy URL below works.
- [ ] A Chrome Web Store developer account (one-time registration fee).
- [ ] Store screenshots (1280×800 or 640×400) and a 440×280 promo tile.

## Before the first upload

1. Build the upload with `bun run package --store`. It is the trial ZIP without
   the manifest `key`, which the store rejects; the store assigns its own ID.
2. Upload it once as a draft to get the store's extension ID.
3. Add `chrome-extension://<store id>` to `ALLOWED_EXTENSION_ORIGINS` in
   `wrangler.jsonc`, next to the trial ID, and run `bun run worker:deploy`.
   Without this, included Azure answers 403 for store installs.
4. Optional: to give trial installs the store's ID, replace the manifest `key`
   with the store's public key (dashboard → Package → View public key). Trial
   installs then reset their settings once.

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

**Privacy policy URL:** https://github.com/Zheckan/shvyd/blob/main/PRIVACY.md
(works once the repository is public and the stack is merged).
