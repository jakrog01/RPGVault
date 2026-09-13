# Assistant retrieval

The assistant indexes Markdown locally. Every query is filtered to the active run before it is ranked. A GM scope includes its run, campaign, party, shared system library, and campaign mechanics. A player scope includes only its run and party. Archive, shipped files, local overrides, application data, excluded notes, and player-hidden notes are never returned.

The shipped policy is `_system/assistant/scope.json`. A local policy at `_local/assistant/scope.json` overrides it. Both use `{ "version": 1, "exclude": ["prefix/"], "gm": ["kind"], "player": ["kind"] }`; `exclude` is optional, and its vault-path prefixes supplement the built-in `Archive/`, `_system/`, `_local/`, `.obsidian/`, and `.rpgvault/` exclusions. Omitted kinds are excluded. Kinds are `run`, `state`, `campaign`, `party`, `system`, `homebrew`, `house-rule`, and `note`; the policy applies to every visible note, including rules outside the standard roots. Policy changes reload immediately. Invalid local policy falls back to the shipped policy.

Rules use hard campaign boundaries. House rules take precedence over campaign homebrew, which takes precedence over the active system library. Rules tied to a campaign link are visible only to that campaign; rules without a campaign link must match the active system.

Pinned run, day, combat, attached, and active-note material is sent first. Relevant chunks are then added within the context budget and cited as wikilinks. Large pinned notes provide an outline and a link to indexed material.

The model can search and read scoped notes, find names, list notes, look up rules, inspect run or combat state, roll dice, and load a skill. These tools are read-only. House rules take precedence over campaign homebrew, which takes precedence over the system library.

Skills are Markdown files with `name` and `description` frontmatter. Shared skills are read from the shipped layer and then the `_local/assistant/skills/` layer, so a local skill with the same name overrides the shipped one. Campaign skills live in `Assistant/skills/` beneath the campaign. For example:

```markdown
---
name: tavern-scene
description: Describe a tavern scene.
---
Use three senses and offer one detail for each party member.
```

The lexical index is always local. Its cache is `.rpgvault/cache/assistant/` and can be rebuilt with the Assistant rebuild index command. The default embedding provider is none; no note text is sent to an embedding service by default.
