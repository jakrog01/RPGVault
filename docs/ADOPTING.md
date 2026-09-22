# Adopting an Existing Vault

Run `node _system/bin/rpgvault.mjs adopt /path/to/source --map mapping.json` from the target vault.

The map names each folder import, plugin-data import, and calendar-definition import. Folder patterns use `*` for one path segment. Plugin settings are copied only into the target plugin `data.json`; the report lists setting names and never values.

```json
{
  "folders": [
    { "from": "Old Campaigns", "to": "Campaigns" },
    { "from": "Rules/*/Creatures", "to": "Library/Mechanics/*/Bestiary", "optional": true }
  ],
  "pluginData": [
    {
      "from": ".obsidian/plugins/old-table/data.json",
      "to": "table-tools",
      "keys": { "token": "apiKey", "activeFile": "activePointerPath" },
      "rewrites": { "activePointerPath": { "Old/Current.md": "Active.md" } }
    }
  ],
  "calendar": { "from": ".obsidian/plugins/calendarium/data.json", "to": ".obsidian/plugins/calendarium/data.json" }
}
```

Entries are required unless marked `"optional": true`; a missing required source fails before the target vault changes, while a missing optional source appears in the report's `skipped` array.
If every required folder is missing but one non-dot source folder would contain a match, the failure prints that inner folder's absolute path as a wrapped-source hint.
