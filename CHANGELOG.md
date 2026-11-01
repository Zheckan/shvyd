# Changelog

Shvyd follows [semantic versioning](https://semver.org/). Each release is a
credential-free ZIP built with `bun run package`.

## Unreleased

### Added

- **Don't show on this site:** the crossed-out eye in the popup turns Shvyd off for the current site after a confirmation. Open tabs on that site drop it at once, and embedded frames follow their page. Settings → Hidden on these sites lists them, with **Show again**.
- Local usage counts per day and route: Azure included access, Azure with your own key, and DeepL. Shows requests, characters, reused results, failures, and uncertain timeouts for today and the last 7, 30, and 90 days.
- DeepL allowance check using the saved key. Uses no characters.
- Optional error records, off by default: at most 100 records kept for 7 days, with preview, JSON download, and clear.
- Versioned, reproducible release ZIP built from an explicit file list, with a SHA-256 checksum and a credential scan.
- The settings header shows the installed version.

### Changed

- Identical simultaneous translations share one provider call. The memory cache is capped at 32 entries and 512 KiB.
- Rate limits, exhausted allowance, connection failures, and timeouts have separate messages.
- Late replies can no longer show an old language or reopen a closed popup.

### Security

- Builds contain no provider credentials. Included Azure access goes through a server relay; your own keys go directly to the provider.
- The first upgrade from the old bootstrap build clears saved keys once and keeps preferences.

## 0.1.0 – prototype

- Selected-text translation with Azure and DeepL, preferred languages, page-matched styling, formatting preservation, copying, and dragging.
