# Upgrading

Migration IDs are immutable. Never edit or reuse an existing migration: an installed vault records completed IDs and will not run an edited migration again. Upgrade repairs belong in a new migration because the CLI already installed in a vault performs the initial replacement; only the newly installed CLI runs pending migrations.

Use the configured release host as the normal update path:

```text
node _system/bin/rpgvault.mjs update --latest
```

The updater checks for a newer release, downloads and validates its archive, then backs up `_system` and changed shipped files to `.rpgvault/backups/<timestamp>/`.
It replaces `_system`, shipped root notes and documentation, mirrors shipped folders such as `docs/` and `.github/`, reconciles only manifest-managed Obsidian files, runs pending migrations, rebuilds the bundled plugin, and runs `doctor`.
Edits to shipped root notes and documentation are retained in the backup; files placed inside a mirrored shipped folder but absent from the release are also removed and backed up.

If the installed CLI predates the network release support introduced in prompt 27, first obtain a release archive and complete one offline `update --from` update below.
That refreshes the shipped CLI; after it succeeds, the Table Tools update check and desktop install button can use the configured release host.

For an offline update, unpack a release and run:

```text
node _system/bin/rpgvault.mjs update --from /path/to/RPGVault-release
```

Add `--dry-run` to either path to preview migrations and every shipped-layer replacement without writing the vault. `_local` and content roots are never replaced. `.rpgvault/state.json` records the installed version and migrations, so it should be committed.
