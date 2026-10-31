# Install, update, and roll back

Shvyd is shared as a ZIP for manual installation in Chromium-based browsers
(Chrome, Helium, Edge, Brave). There is no store listing yet.

## Install

1. Download `shvyd-<version>.zip` and its `.sha256` file.
2. Optional: check the download. In the download folder, run
   `shasum -a 256 -c shvyd-<version>.zip.sha256`. It should print `OK`.
3. Extract the ZIP into a folder you will keep, for example
   `~/Applications/Shvyd`. **Keep using this same folder for every update.** The
   browser ties the extension's saved settings to the folder's location.
4. Open `chrome://extensions`, turn on **Developer mode**, click **Load
   unpacked**, and choose that folder.
5. Reload any open tabs, select text, and click **Translate**.

Azure works immediately through included access. To use DeepL or your own Azure
key, click the Shvyd toolbar icon to open settings.

## Update

1. Extract the new ZIP **into the same folder**, replacing the old files. Delete
   the folder's old contents first so no stale files remain.
2. In `chrome://extensions`, click the reload icon on the Shvyd card.
3. Reload open tabs. Settings, keys, and usage counts are kept.

The settings header shows the installed version.

## Roll back

Keep the previous ZIP. To go back, extract it into the same folder the same way,
then reload the extension. Settings are kept because the folder location has not
changed.

## Remove local data

- **Usage counts:** Settings → Usage → **Clear usage**.
- **Error records:** Settings → Error records → **Clear**, or turn the option off.
- **Everything:** remove the extension at `chrome://extensions`. This deletes
  settings, keys, usage counts, and error records from this browser.

Choosing **Remove** and then loading the folder again starts with default
settings.

## Pages Shvyd cannot run on

Browser pages (`chrome://`), extension store pages, the built-in PDF viewer, and
text inside input fields and text areas.
