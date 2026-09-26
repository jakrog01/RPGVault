# Customising Table Tools

Table Tools uses English strings by default. To override selected labels locally, create `_local/plugins/table-tools/strings.json` in your vault. The file is read when the plugin loads. Unknown keys are ignored, and malformed JSON leaves the English strings active after showing a notice.

Your vault may enable its own community plugins, themes, and snippets; updates keep them and their local files.
Template community plugins must remain enabled, and `doctor` reports any required template plugin that is missing.

Put owner notes in the content roots and private templates or scripts in `_local/`. Do not put owner material in `docs/`, `.github/`, `Home.md`, `README.md`, or `CHANGELOG.md`: these are shipped paths and updates replace or mirror them, saving prior copies only in the update backup.

```json
{
  "combat": "Encounter",
  "openCombat": "Open encounter tracker",
  "assistant": "Game assistant"
}
```
