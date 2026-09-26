# Changelog

## Unreleased

## 1.1.0

- `rpgvault update --check` asks the release host named in `_system/manifest.json` whether a newer release exists and records the answer in `.rpgvault/state.json`; `_local/release.json` points a fork somewhere else.
- `rpgvault update --latest` downloads that release, validates the archive before touching anything, and installs it through the same path as `update --from`. Both requests have deadlines, and every refusal names its cause instead of leaking a file or network error.
- An update now installs the whole shipped layer the release provides, not only `_system`: `docs/`, `Home.md`, `README.md`, `CHANGELOG.md` and `.github/`. Shipped folders are mirrored, so a file the release does not have is removed. Everything overwritten or removed goes to `.rpgvault/backups/<timestamp>/` first, and the report names each file and the backup. Put your own notes in the content roots or `_local/`, never in `docs/`.
- `doctor` requires every path declared in `ownedGlobs` to have exactly one update handler, so the manifest cannot drift from what the updater does.
- An update whose finalisation fails now forwards the migration and doctor output, says that `_system` was already replaced, and names the backup, instead of reporting a raw child-process failure.
- Table Tools settings gained an Updates section: a **Check for updates** button and an optional daily check at startup. Both work on mobile and download nothing.
- The table home shows a banner when a newer release has been found, and on the desktop an **Install update** button runs `update --latest` in a modal that streams the CLI's own report; reload Obsidian when it finishes.
- Added scoped assistant retrieval, read-only vault tools, and loadable skills.

### Upgrading from 1.0.0

Your installed 1.0.0 CLI performs this upgrade itself, so take the first hop offline:

```text
node _system/bin/rpgvault.mjs update --from /path/to/RPGVault.zip
```

That CLI discards everything finalisation prints, so the upgrade says nothing at all, whether it worked or not. Run `node _system/bin/rpgvault.mjs doctor` afterwards to see where you stand. `update --check`, `update --latest` and the wider shipped layer take effect from the next update, which 1.1.0 performs itself.

## 1.0.0

First release of the upgradeable tabletop RPG vault template.

- Shipped system in `_system/`, replaced wholesale on update; your overrides in `_local/`; your game material in `Campaigns/`, `Parties/`, `Runs/`, `Library/`, `Calendar/`, and `Archive/`.
- `rpgvault` CLI: `init`, `doctor`, `update --from` with a hand-off to the newly installed CLI and backups, installable and removable demo, and mapping-driven `adopt` for existing vaults.
- System packages for generic play, D&D 5e, and Call of Cthulhu 7e, with radar checks for missing fields, dormant quests, duplicates, and unresolved links.
- Bundled Templater and Calendarium configuration.
- Table Tools plugin: combat tracker with initiative groups, encounter difficulty, row input for damage, healing, and temporary hit points, conditions, statblock cards with clickable dice, encounter sets, and Markdown export; a Gemini assistant with run context, quick prompts, attachments, and conversation history. Every interface string can be overridden in `_local/plugins/table-tools/strings.json`.
