# zrub Maintenance

`zrub` installed this project's agent guides. This file is the agent's
self-service manual: everything needed to update the installation or re-apply
the repository standard without asking anyone.

## What zrub installed

- The managed section at the top of `AGENTS.md`, between the
  `<!-- zrub:agents-project-guide:start -->` and `:end -->` markers.
- `docs/findings.md`, the findings ledger.
- The guides under `docs/project-guides/`, including this file.

## Tasks

- Reinstall, update, or add guides: run `npx @zheckan/zrub@latest`. The managed
  `AGENTS.md` section is preserved byte-for-byte; every other write is shown
  for review first.
- Re-apply the GitHub repository standard (settings, the `main-protection`
  branch ruleset, `release-tags` protection): follow
  `docs/project-guides/github-repo-setup-profile.md`. Source of truth:
  https://github.com/Zheckan/zrub/blob/main/resources/github-repo-setup-profile/github-repo-setup-profile.md
- Record findings in `docs/findings.md`.

## Rules

- Keep the marker lines in `AGENTS.md` intact; everything between them is
  editable.
- There is no uninstall workflow yet. Removing installed files by hand is
  fine; when removing the managed section, remove both marker lines with it.
- Never record secrets in findings or guides.
