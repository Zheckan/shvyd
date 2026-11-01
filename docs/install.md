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

Azure works through included access only for extension IDs the relay allows.
An unpacked extension's ID comes from its folder path, so today included access
works only when loaded from the maintainer's `dist/` folder. Anywhere else the
popup says included access is unavailable; add your own Azure key in settings.
Pinning one ID for every install needs a relay update first; see
[releasing](releasing.md). To use DeepL or your own Azure
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
- **Hidden sites:** Settings → Hidden on these sites → **Show again**.
- **Everything:** remove the extension at `chrome://extensions`. This deletes
  settings, keys, usage counts, and error records from this browser.

Choosing **Remove** and then loading the folder again starts with default
settings.

## Turn Shvyd off on a site

In the popup, click the crossed-out eye, then **Don't show here**. Open tabs on that site drop Shvyd immediately. To bring it back, open settings → **Hidden on these sites** → **Show again**, then reload that site's tabs.

## Pages Shvyd cannot run on

Browser pages (`chrome://`), extension store pages, and the built-in PDF viewer.
Password fields and other non-text inputs never offer translation; plain text
fields, search fields, and text areas do.
