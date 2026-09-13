# ADR 0001: release zip plus migrations

## Decision

RPGVault distributes versioned release zips and updates with `rpgvault update`. The command has an offline `--from` path, replaces only `_system`, preserves `_local` and content roots, and executes idempotent content migrations.

## Rejected alternatives

An upstream Git merge is useful for expert Git users but causes conflict-prone Obsidian merges. A submodule makes the boundary explicit but introduces submodule workflows and inconsistent Obsidian indexing. GitHub template repositories are appropriate for starting a vault, but they deliberately sever history and cannot provide upgrades.
