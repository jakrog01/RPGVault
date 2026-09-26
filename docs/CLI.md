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
node _system/bin/rpgvault.mjs update --check
node _system/bin/rpgvault.mjs update --latest [--dry-run]
```

`--from` is required and names a release directory or a `.zip` release containing `_system/`.
Without `--dry-run`, update copies the current `_system/` to `.rpgvault/backups/<timestamp>/`, replaces `_system/`, then replaces shipped `Home.md`, `README.md`, `CHANGELOG.md`, `docs/`, and `.github/` entries that the release provides before it runs `finalize-update`.
Shipped folders are mirrored, so files absent from the release are removed; every overwritten or removed item is saved in that backup first.
The report gives one line for each shipped entry with written and removed counts, names changed or removed files, and says when a release provides no entry to replace.
Finalisation runs migrations, reconciles managed Obsidian artifacts, refreshes the bundled plugin, writes installed version state, and runs `doctor`.
Success forwards migration reports and the final `doctor` output, including the clean line.
If finalisation fails, update forwards its migration and doctor output, then reports that `_system` was already replaced and names the backup directory.
It still exits non-zero; fix the reported issue and run `doctor`, or restore the named backup if that is the owner's decision.
With `--dry-run`, it prints the `_system` and wider shipped-layer actions it would take, then runs migrations in dry-run mode without writing a backup or replacing files.
It fails when `--from` is absent, the source does not exist, or the source has no `_system` directory.
Run it to install an offline release; see [Upgrading](UPGRADING.md) for release workflow.

`--check` explicitly asks the configured release host for its latest release without downloading or replacing anything.
When newer it prints `update available: <latest> (installed <installed>)` and `run node _system/bin/rpgvault.mjs update --latest to install it`.
When current it prints `up to date (<installed>)`.
On success it records the checked time, release version, and repository in `.rpgvault/state.json`.
It fails when the release source is not configured, the host cannot be reached or times out, rejects the request, returns unreadable JSON, or has no numeric release tag.
Set `RPGVAULT_RELEASE_TIMEOUT` to a positive integer number of milliseconds to replace the 15,000 ms lookup deadline and 300,000 ms download deadline.
`--check` and `--from` are mutually exclusive.
The release source starts with `_system/manifest.json`, accepts optional `repo`, `asset`, and `api` overrides in `_local/release.json`, then lets `RPGVAULT_RELEASE_API` override the API base.
Its `api` must be an absolute `http:` or `https:` URL, and its `repo` must be exactly `owner/name` with neither whitespace nor extra slashes.

`--latest` runs the same explicit lookup, and if a newer release exists downloads its named asset with redirects enabled.
It validates that the archive contains `_system/` and that `_system/VERSION` matches the release version before writing into the vault.
The validated archive is retained as `.rpgvault/cache/RPGVault-<version>.zip`, then installed through the normal `--from` replacement path.
With `--dry-run`, it fetches and validates the archive in temporary storage, prints `would replace _system from <path>`, runs migrations in dry-run mode, and leaves no cache archive or other vault changes.
It refuses a release missing the expected asset, an unavailable or timed-out download, an unreadable archive, a missing `_system/` or `_system/VERSION`, a version mismatch, or `--latest` together with `--from`.

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
`--check` belongs to `update` and reports whether the configured release host has a newer version.
`--latest` belongs to `update` and fetches, validates, and installs a newer configured release.
`--dry-run` belongs to `update` and previews migration work without replacing `_system/`.
`--map` belongs to `adopt` and supplies the import mapping JSON file.
No other CLI flags are accepted by the current command parser.
Use [Troubleshooting](TROUBLESHOOTING.md) to interpret a failed `doctor` command.
