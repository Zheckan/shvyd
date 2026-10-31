# Releasing

The owner reviews and merges the stack, and asks for a release explicitly.
Nothing here publishes automatically.

## 1. Prepare

1. Choose the version (for example `1.0.0`) and set it in both `package.json`
   and `extension/manifest.json`. Packaging stops if they differ.
2. Move the `Unreleased` entries in `CHANGELOG.md` under that version with the
   date.
3. If the relay handler changed, deploy it first with `bun run worker:deploy`
   (see [shared Azure](shared-azure.md)).

## 2. Build and check

```sh
bun run verify
bun run package                     # writes release/shvyd-<version>.zip and .sha256
rm -rf /tmp/shvyd-release && mkdir /tmp/shvyd-release
unzip -q release/shvyd-<version>.zip -d /tmp/shvyd-release
SHVYD_EXTENSION_DIR=/tmp/shvyd-release python3 scripts/check-reliability.py
```

`bun run package` builds into a fresh directory, copies only `RELEASE_FILES`
from `scripts/package.ts`, refuses to write a ZIP that contains any `.env` or
environment value whose name ends in `KEY`, `TOKEN`, `SECRET`, or `PASSWORD`,
and produces the same bytes for the same source. It prints any built files it
left out.

The reliability check runs the exact extracted files in an isolated Helium
profile with controlled provider replies.

## 3. Manual checks with the extracted ZIP

Load `/tmp/shvyd-release` as unpacked in a fresh browser profile. Chrome stable
does not accept `--load-extension`, so use **Load unpacked** by hand. Then check:

- [ ] Both key fields start empty; included Azure translates.
- [ ] DeepL with your own key translates; **Check allowance** shows a result.
- [ ] Updating over the previous release in the same folder keeps settings.
- [ ] Browser pages and PDFs show no popup, and nothing breaks there.
- [ ] Remembered and fixed languages; formatted text; copy; drag; Escape; Tab focus.
- [ ] Error messages for a wrong key; **Clear usage**; error-record export.

## 4. Publish

Tag the release (`git tag v<version>`) and attach the ZIP and `.sha256` to a
GitHub release only when the owner asks. Keep the previous release's ZIP
available for rollback; see [install](install.md).
