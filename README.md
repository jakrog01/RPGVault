# RPGVault

RPGVault is an English, upgradeable Obsidian template for tabletop campaigns. It keeps the shipped system separate from your game material.

```
_system/  shipped, replaced on update
_local/   your overrides, never updated
Campaigns/ Parties/ Runs/ Library/ Calendar/ Archive/  your content
```

Open a clone in Obsidian, then run `node _system/bin/rpgvault.mjs doctor`. Install the example with `node _system/bin/rpgvault.mjs demo install`; remove only its stamped notes with `demo remove`.

For an offline update, download a release and run `node _system/bin/rpgvault.mjs update --from /path/to/release`. Backups are written to `.rpgvault/backups/`. GitHub's **Use this template** starts an independent vault; it does not preserve history and is not an upgrade mechanism.

The Table Tools plugin adds a combat tracker and a Gemini assistant; translate or rename any of its labels through `_local/plugins/table-tools/strings.json`.

See [architecture](docs/ARCHITECTURE.md), [assistant retrieval](docs/ASSISTANT.md), [customisation](docs/CUSTOMISING.md), [upgrading](docs/UPGRADING.md), and [adopting an existing vault](docs/ADOPTING.md).
