# Architecture

RPGVault separates shipped machinery from the material a table owns. `_system` is the shipped layer and is replaced by an update, so it is never a place for campaign work. `_local` mirrors paths in `_system`; the resolver tries `_local/<path>` before `_system/<path>`. A local template, string override, or private script therefore wins without changing a shipped file and survives later updates.

## Layers and update ownership

The manifest's `ownedGlobs` gives each shipped path exactly one update handler. `doctor` rejects a missing or duplicate handler so an update cannot have ambiguous ownership.

- `_system/**` is replaced wholesale.
- `.obsidian/**` is selectively reconciled as managed Obsidian artifacts, while workspace files and plugin data listed as never-touch stay owned by the vault.
- `.rpgvault/state.json` is written by the CLI to record installed state and migrations.
- `replaceOnUpdate` mirrors the shipped root notes and folders: `Home.md`, `README.md`, `CHANGELOG.md`, `docs/**`, and `.github/**`.

Mirroring means a released folder is made to match the release. Before an overwritten or removed shipped item is changed, the updater preserves it in the update backup. `_local` and the content roots are not in the shipped layer.

## Content and packages

`contentRoots` declares `Campaigns`, `Parties`, `Runs`, `Library`, `Calendar`, and `Archive`. Campaigns hold reusable world material, parties hold rosters, and runs hold table-specific records. Library holds mechanics and assets; Calendar holds table-plugin data; Archive is excluded from automation. `doctor` requires the declared roots, but they may be empty.

System packages under `_system/systems/<id>/` describe supported note shapes and required frontmatter for a game system. They provide structure rather than published rulebook text or statblocks. Local experimentation belongs in `_local` until a package is ready to ship.

## Radar and reference boundaries

The GM radar checks campaign, party, run, and shared context. The player radar records claims with `about`, `what`, `from`, `session`, and `status`; it does not turn player prose into GM truth. The manifest's bulk reference folders remain searchable but are excluded from completeness checks.

Contractual names such as `Run.md` and `World Day.md` may repeat, so generated references to them are path-qualified. This keeps links unambiguous while allowing each campaign or run to use the same familiar note names.
