# Upgrading

Migration IDs are immutable. Never edit or reuse an existing migration: an installed vault records completed IDs and will not run an edited migration again. Upgrade repairs belong in a new migration because the CLI already installed in a vault performs the initial replacement; only the newly installed CLI runs pending migrations.

Use a release zip as the normal distribution format. The updater backs up `_system` to `.rpgvault/backups/<timestamp>/`, replaces that layer, reconciles only manifest-managed Obsidian files, runs pending migrations, rebuilds the bundled plugin, and runs `doctor`.

For an offline update, unpack a release and run:

```text
node _system/bin/rpgvault.mjs update --from /path/to/RPGVault-release
```

Add `--dry-run` to preview migrations. `_local` and content roots are never replaced. `.rpgvault/state.json` records the installed version and migrations, so it should be committed.
