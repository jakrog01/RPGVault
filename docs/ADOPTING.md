# Adopting an Existing Vault

Run `node _system/bin/rpgvault.mjs adopt /path/to/source --map mapping.json` from the target vault.

The map names each folder import, optional plugin-data import, and optional calendar-definition import. Folder patterns use `*` for one path segment. Plugin settings are copied only into the target plugin `data.json`; the report lists setting names and never values.

```json
{
  "folders": [
    { "from": "Old Campaigns", "to": "Campaigns" },
    { "from": "Rules/*/Creatures", "to": "Library/Mechanics/*/Bestiary" }
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
