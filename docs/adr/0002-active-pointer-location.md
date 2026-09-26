# ADR 0002: active run pointer location

## Decision

The active run pointer is the root `Active.md` note. It is user state, not shipped system state.

## Rationale

The pointer must survive wholesale replacement of `_system` during an update. Keeping it at the root also allows Obsidian link resolution without plugin-specific storage APIs. `rpgvault` treats it as a contractual note name and migrations recover legacy pointers from backups.
