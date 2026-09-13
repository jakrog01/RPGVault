# Changelog

## 1.0.0

First release of the upgradeable tabletop RPG vault template.

- Shipped system in `_system/`, replaced wholesale on update; your overrides in `_local/`; your game material in `Campaigns/`, `Parties/`, `Runs/`, `Library/`, `Calendar/`, and `Archive/`.
- `rpgvault` CLI: `init`, `doctor`, `update --from` with a hand-off to the newly installed CLI and backups, installable and removable demo, and mapping-driven `adopt` for existing vaults.
- System packages for generic play, D&D 5e, and Call of Cthulhu 7e, with radar checks for missing fields, dormant quests, duplicates, and unresolved links.
- Bundled Templater and Calendarium configuration.
- Table Tools plugin: combat tracker with initiative groups, encounter difficulty, row input for damage, healing, and temporary hit points, conditions, statblock cards with clickable dice, encounter sets, and Markdown export; a Gemini assistant with run context, quick prompts, attachments, and conversation history. Every interface string can be overridden in `_local/plugins/table-tools/strings.json`.
