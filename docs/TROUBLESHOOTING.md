# Troubleshooting

Run the check from the vault root:

```text
node _system/bin/rpgvault.mjs doctor
```

A healthy vault prints `RPGVault doctor: clean (<version>)`.
Otherwise it prints `RPGVault doctor found <count> violation(s):` and one or more lines below.
Fix the reported files, then run `doctor` again rather than assuming the first issue was the only one.

## `missing content root: <folder>`

Meaning: one of the six declared content roots is absent.
Usual cause: a root such as `Campaigns/` or `Archive/` was deleted or renamed.
Fix: restore the named root at the vault root; it is a user-content folder and can be empty.

## `undeclared root: <name>`

Meaning: a top-level directory is not a known system, application, documentation, test, or content directory.
Usual cause: a scratch or imported folder was left at the vault root.
Fix: move its content into an appropriate content root, `_local/`, or `docs/`, then remove the undeclared root.

## `undeclared root file: <name>`

Meaning: a top-level file is not one of the root files recognised by the vault.
Usual cause: a note, export, or temporary file was created at the root.
Fix: move the file into a content root or a documented location, then run `doctor` again.

## `missing managed Obsidian artifact: .obsidian/<path>`

Meaning: a template-managed Obsidian file is missing.
Usual cause: a plugin manifest, stylesheet, or shared Obsidian configuration was deleted.
Fix: run `node _system/bin/rpgvault.mjs init` to refresh managed artifacts, or update from a known-good release.

## `invalid community plugin list: .obsidian/community-plugins.json`

Meaning: `community-plugins.json` is not valid JSON containing an array of strings.
Usual cause: a manual edit left malformed JSON, an object, or a non-string entry in the list.
Fix: run update from a known-good release; update repairs the list and keeps valid local plugin ids.

## `missing template plugins in .obsidian/community-plugins.json: <ids>`

Meaning: one or more plugin ids contributed by the template are not enabled in the community-plugin list.
Usual cause: the list was edited or restored without a required template plugin.
Fix: enable the named ids in Obsidian or run update, which appends missing template ids without removing local ones.

## `managed Obsidian artifact differs: .obsidian/<path>`

Meaning: a wholly managed Obsidian artifact no longer matches the shipped version.
Usual cause: a shipped plugin file, manifest, or stylesheet was manually edited.
Fix: update from a known-good release, or run `node _system/bin/rpgvault.mjs init` to refresh the managed artifact.

## `managed Obsidian key differs: .obsidian/<path>:<key>`

Meaning: a managed key in a shared Obsidian JSON file differs from the shipped value.
Usual cause: a setting owned by the template was changed locally.
Fix: run `node _system/bin/rpgvault.mjs init` or update from a known-good release to restore that managed key.

## `plugin build is stale`

Meaning: `.rpgvault/plugin-build.json` does not match the shipped Table Tools source hash.
Usual cause: the bundled plugin source changed without a refreshed bundle, or build state was removed.
Fix: run `node _system/bin/rpgvault.mjs init` to refresh the bundled plugin and build state, then rerun `doctor`.

## `missing template: <file>`

Meaning: a template named by a manifest template rule is absent from `_system/templates/`.
Usual cause: shipped template files were removed or an incomplete release was copied.
Fix: update from a complete known-good release; do not restore shipped templates from unrelated vault content.

## `unqualified contractual embed in <file>: <name>`

Meaning: a shipped template embeds a repeatable contractual note name without its path.
Usual cause: a shipped template was edited to use an ambiguous embed such as `Run.md` alone.
Fix: restore the shipped template through update, or maintainers should qualify the embedded path in the source template.

## `duplicate basename: <name>`

Meaning: two content notes share a basename that is not declared contractual.
Usual cause: copied notes retained the same filename in separate content locations.
Fix: rename one note or move it so the basename is unique; use path-qualified links after renaming.

## `template type has no base: <type>`

Meaning: a shipped template frontmatter type has no matching base definition.
Usual cause: a shipped template changed without its accompanying base file.
Fix: update from a complete release; system authors must add a base that selects the declared type.

## `runtime state path inside shipped layer in <file>: <path>`

Meaning: shipped script or plugin source uses an unapproved `_system/` runtime-state path.
Usual cause: the shipped layer was modified to store changing state inside itself.
Fix: restore `_system/` from a known-good release; maintainers should place runtime state in a vault-owned location instead.

## `unresolved literal path in <file>: <path>`

Meaning: shipped code contains a literal vault path that does not exist.
Usual cause: a required shipped or content path was renamed or deleted.
Fix: restore the named path when it is required content, or update from a release when the literal belongs to shipped code.

## `non-ASCII shipped file: <path>`

Meaning: a shipped file path or its contents contains non-ASCII text outside the explicit allowlist.
Usual cause: a modified shipped file introduced a non-ASCII character.
Fix: restore the shipped file from a known-good release; keep tracked shipped text ASCII unless the manifest explicitly permits it.

## `empty scaffold without declaration: <folder>`

Meaning: a lone `.gitkeep` or `.rpgvault-keep` marks an empty folder that is not declared as a scaffold or content root.
Usual cause: an empty temporary folder was committed outside the recognised folder layout.
Fix: remove the placeholder and folder, or move the intended folder under the appropriate declared content root or local layer.

## Common failures outside the doctor catalogue

`adopt map source missing: <from>` or `adopt map sources missing: <from>, <from>` means a required map source was not found before adoption wrote the target.
Fix the map `from` value or source layout; when all required folders are inside one wrapper, use the absolute wrapped-folder hint printed with the error.

`update source does not exist: <path>` means the `--from` directory or zip path is wrong.
Check the path, then run `node _system/bin/rpgvault.mjs update --from <directory-or-zip>` again.

`update source has no _system directory: <path>` means the selected directory is not an unpacked RPGVault release.
Point `--from` at the release root that contains `_system/`, rather than at its parent or an unrelated folder.

`release source is not configured` means neither the shipped manifest nor `_local/release.json` provides both a release repository and API base.
Restore the shipped release block or set the missing local override; `RPGVAULT_RELEASE_API` can replace only the API base.

`release source has invalid api "<value>"` or `release source has invalid repo "<value>"` means a configured value cannot identify a release host.
Use an absolute `http:` or `https:` API URL and an exact `owner/name` repository with no whitespace or extra slashes, then retry.

`release check timed out` or `release download timed out: <asset>` means the release host did not answer before its deadline.
Check the host and connection, then retry; set `RPGVAULT_RELEASE_TIMEOUT` to a positive millisecond value only when a longer deadline is appropriate.

`release check failed: invalid release version "<value>"` means the latest tag is not numeric segments separated by dots.
Publish a tag such as `v1.2.3`, `2026.01`, or `1.0.0.1`, then retry the update.

`release archive validation failed: archive has no _system/VERSION file` means the downloaded archive is not a complete RPGVault release.
Publish a release archive with `_system/VERSION` matching its release tag; do not install that archive.

`update accepts either --check or --from, not both` means a release check was given an offline source path.
Run `update --check` alone, or use `update --from <directory-or-zip>` for an offline update.

An unreadable `community-plugins.json` is reported by doctor as the invalid community plugin list violation above.
Update repairs malformed JSON, non-arrays, and non-string entries while preserving valid local plugin ids.

A stale plugin build is reported by doctor as `plugin build is stale`.
Run `node _system/bin/rpgvault.mjs init` to refresh the bundle and `.rpgvault/plugin-build.json`.

For update workflow and backups, read [Upgrading](UPGRADING.md).
For import-map failures, read [Adopting an existing vault](ADOPTING.md).
For the complete command reference, read [CLI reference](CLI.md).
