# CLI reference

Run the CLI from the vault root. Every command uses the shipped path below.
The top-level usage is printed as an error for an unknown command.
Commands report failures as `rpgvault: <message>` and set a non-zero exit code.

## `init`

```text
node _system/bin/rpgvault.mjs init
```

Initialise the vault folders and managed Obsidian artifacts.
It creates manifest folders, content roots, `.rpgvault/`, managed `.obsidian/` files, the bundled plugin files, and `.rpgvault/plugin-build.json`.
It creates the default Calendarium data only when that target does not already exist.
It creates or completes `.rpgvault/state.json` with install identity and installed version.
Success prints `initialised RPGVault <version>`.
It fails if shipped configuration cannot be read or a required target cannot be written.
Run it when preparing a template copy that has not yet been initialised.

## `doctor`

```text
node _system/bin/rpgvault.mjs doctor
```

Check content roots, root declarations, managed Obsidian artifacts, plugin freshness, templates, bases, shipped paths, ASCII, and scaffold declarations.
It reads the vault and writes no repair files.
Success prints `RPGVault doctor: clean (<version>)`.
Violations print `RPGVault doctor found <count> violation(s):` followed by one line per violation and return non-zero.
Run it after setup, update, adoption, or any unexpected vault change.

## `update`

```text
node _system/bin/rpgvault.mjs update --from <directory-or-zip> [--dry-run]
```

`--from` is required and names a release directory or a `.zip` release containing `_system/`.
Without `--dry-run`, update copies the current `_system/` to `.rpgvault/backups/<timestamp>/`, replaces `_system/`, then runs `finalize-update`.
Finalisation runs migrations, reconciles managed Obsidian artifacts, refreshes the bundled plugin, writes installed version state, and runs `doctor`.
Success forwards migration reports and the final `doctor` output, including the clean line.
With `--dry-run`, it prints `would replace _system from <path>` and runs migrations in dry-run mode without replacing `_system/`.
It fails when `--from` is absent, the source does not exist, or the source has no `_system` directory.
Run it to install an offline release; see [Upgrading](UPGRADING.md) for release workflow.

## `demo install`

```text
node _system/bin/rpgvault.mjs demo install
```

Copy shipped demo notes into the content roots, replacing files at matching demo paths.
It writes the demo campaign, party, run, library, and calendar material.
Success prints `demo installed`.
It fails if the shipped demo cannot be read or the target files cannot be copied.
Run it to inspect a working example before entering your own material.

## `demo remove`

```text
node _system/bin/rpgvault.mjs demo remove
```

Remove Markdown content whose frontmatter has `origin: demo`.
It deletes those notes and removes empty directories beneath the demo roots.
Success prints `removed <count> demo notes`.
It fails if a scanned note or directory cannot be read or removed.
Run it after you no longer need the installed example.

## `demo status`

```text
node _system/bin/rpgvault.mjs demo status
```

Count Markdown notes whose frontmatter has `origin: demo`.
It writes nothing.
Success prints `demo notes: <count>`.
It fails if a scanned content file cannot be read.
Run it before removal to see whether demo content remains.

## `adopt`

```text
node _system/bin/rpgvault.mjs adopt <source-path> --map <mapping.json>
```

`--map` is required and names a JSON mapping file; the positional source path is also required.
Adopt validates every required mapped folder, plugin-data file, and calendar file before initialising or copying anything.
On success it initialises the target, imports mapped files and selected plugin keys, writes `.rpgvault/state.json`, prints a JSON report, and runs `doctor`.
The report includes folder file counts, imported plugin key names, calendar status, and missing optional entries in `skipped`.
It fails for a missing source or map, an invalid map, or `adopt map source missing: <from>` when a required map source is absent.
Run it to bring an existing vault into RPGVault; see [Adopting an existing vault](ADOPTING.md) for map structure.

## `finalize-update`

```text
node _system/bin/rpgvault.mjs finalize-update
```

Run pending migrations, reconcile managed Obsidian artifacts, refresh the bundled plugin, update `.rpgvault/state.json`, and run `doctor`.
It writes migration results, managed artifacts, plugin files, plugin-build state, and installed-version state.
Success ends with the normal clean `doctor` output when no violation remains.
It fails if a migration, managed artifact refresh, plugin refresh, state write, or doctor check fails.
`update` runs `finalize-update` itself after replacing `_system/`; run `update` rather than invoking this command for normal upgrades.

## Flags at a glance

`--from` belongs to `update` and supplies a directory or zip release source.
`--dry-run` belongs to `update` and previews migration work without replacing `_system/`.
`--map` belongs to `adopt` and supplies the import mapping JSON file.
No other CLI flags are accepted by the current command parser.
Use [Troubleshooting](TROUBLESHOOTING.md) to interpret a failed `doctor` command.
