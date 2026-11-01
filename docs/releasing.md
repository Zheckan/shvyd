# Releasing

Every merge to `main` publishes a GitHub release. The
[release workflow](../.github/workflows/release.yml) runs `bun run verify`,
picks the version, builds the ZIP with `bun run package`, tags `v<version>`,
and attaches the ZIP and its `.sha256`.

## Versions

You own major and minor. CI owns the patch.

- Each merge releases the next patch in the current line: `0.0.1`, `0.0.2`,
  `0.0.3`, and so on. CI stamps that number into the build and the tag only.
  It never commits it, so `package.json` keeps the version you set.
- To start a new line, set the new version, for example `0.1.0` or `1.0.0`, in
  both `package.json` and `extension/manifest.json`, and merge it. That merge
  releases exactly that version, and later merges continue from it.

`scripts/release-version.ts` holds the rule, and its test lists the cases.

The steps below are for a release you want to check by hand, such as the first
release of a new line.

## 1. Prepare

1. For a new line, set the version in both `package.json` and
   `extension/manifest.json`. Packaging stops if they differ.
2. Move the `Unreleased` entries in `CHANGELOG.md` under that version with the
   date.
3. Make sure the relay allows the extension ID that will run the release:
   `ALLOWED_EXTENSION_ORIGINS` in `wrangler.jsonc`. The `key` in
   `extension/manifest.json` fixes the ID of every unpacked install at
   `fccglnmggflkkamnjjkibkbbakdkhgil`; a unit test fails if the relay list
   drops it. Store installs use the ID the store assigns.
4. If the relay handler or its allowed origins changed, deploy it first with `bun run worker:deploy`
   (see [shared Azure](shared-azure.md)).

## 2. Build and check

```sh
bun run verify
bun run package                     # writes release/shvyd-<version>.zip and .sha256
bun run package --store             # writes release/shvyd-<version>-store.zip without the manifest key
rm -rf /tmp/shvyd-release && mkdir /tmp/shvyd-release
unzip -q release/shvyd-<version>.zip -d /tmp/shvyd-release
SHVYD_EXTENSION_DIR=/tmp/shvyd-release python3 scripts/check-reliability.py
```

`bun run package` builds into a fresh directory, copies only `RELEASE_FILES`
from `scripts/package.ts`, refuses to write a ZIP that contains any `.env` or
environment value whose name ends in `KEY`, `TOKEN`, `SECRET`, or `PASSWORD`,
and produces the same bytes for the same source. It prints any built files it
left out.

The matching private key is kept outside the repository, at
`~/.config/shvyd/extension-key.pem` on the maintainer's machine. Unpacked
installs and store uploads do not need it; it only matters for packing a
`.crx` with the same ID.

The reliability check runs the exact extracted files in an isolated Helium
profile with controlled provider replies.

## 3. Manual checks with the extracted ZIP

Load `/tmp/shvyd-release` as unpacked in a fresh browser profile. Chrome stable
does not accept `--load-extension`, so use **Load unpacked** by hand. Then check:

- [ ] Both key fields start empty; included Azure translates.
- [ ] DeepL with your own key translates; **Check allowance** shows a result.
- [ ] Updating over the previous release keeps settings.
- [ ] Browser pages and PDFs show no popup, and nothing breaks there.
- [ ] Remembered and fixed languages; formatted text; copy; drag; Escape; Tab focus.
- [ ] Error messages for a wrong key; **Clear usage**; error-record export.

## 4. Publish

Merging to `main` publishes the release. Previous releases stay on the
[releases page](https://github.com/Zheckan/shvyd/releases) for rollback; see
[install](install.md).
