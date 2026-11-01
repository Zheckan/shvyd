# Install, update, and roll back

Shvyd is shared as a ZIP for manual installation in Chromium-based browsers
(Chrome, Helium, Edge, Brave). There is no store listing yet.

## Install

1. Download `shvyd-<version>.zip` and its `.sha256` file.
2. Optional: check the download. In the download folder, run
   `shasum -a 256 -c shvyd-<version>.zip.sha256`. It should print `OK`.
3. Extract the ZIP into a folder you will keep, for example
   `~/Applications/Shvyd`. The browser loads Shvyd from this folder, so don't
   delete it.
4. Open `chrome://extensions`, turn on **Developer mode**, click **Load
   unpacked**, and choose that folder.
5. Reload any open tabs, select text, and click **Translate**.

Azure works without a key through included access. Every copy of the ZIP has
the same extension ID (`fccglnmggflkkamnjjkibkbbakdkhgil`), whatever folder it is
loaded from, and the relay accepts that ID. To use DeepL or your own Azure key,
click the Shvyd toolbar icon and choose **All settings**.

Builds from before the fixed ID had a different ID. Loading this one starts with
default settings once; add your keys again.

## Update

1. Delete the old files in the Shvyd folder and extract the new ZIP there.
2. In `chrome://extensions`, click the reload icon on the Shvyd card.
3. Reload open tabs. Settings, keys, and usage counts are kept.

The settings header shows the installed version.

## Roll back

Keep the previous ZIP. To go back, extract it the same way and reload the
extension. Settings are kept because the extension ID does not change.

## Remove local data

- **Usage counts:** Settings → Usage → **Clear usage**.
- **Error records:** Settings → Error records → **Clear**, or turn the option off.
- **Hidden sites:** Settings → Hidden on these sites → **Show again**.
- **Everything:** remove the extension at `chrome://extensions`. This deletes
  settings, keys, usage counts, and error records from this browser.

Choosing **Remove** and then loading the folder again starts with default
settings.

## Turn Shvyd off on a site

On that site, click the Shvyd icon in the browser toolbar and switch the site off. Open tabs on that site drop Shvyd immediately. Switch it back on the same way, or use settings → **Hidden on these sites** → **Show again**; open tabs pick it up without a reload.

## Pages Shvyd cannot run on

Browser pages (`chrome://`), extension store pages, and the built-in PDF viewer.
Password fields and other non-text inputs never offer translation; plain text
fields, search fields, and text areas do.
