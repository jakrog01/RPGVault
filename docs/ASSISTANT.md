# Assistant retrieval

The assistant indexes Markdown locally. Every query is filtered to the active run before it is ranked. A GM scope includes its run, campaign, party, shared system library, and campaign mechanics. A player scope includes only its run and party. Archive, shipped files, local overrides, application data, excluded notes, and player-hidden notes are never returned.

The shipped policy is `_system/assistant/scope.json`. A local policy at `_local/assistant/scope.json` overrides it. Both use `{ "version": 1, "gm": ["kind"], "player": ["kind"] }`; omitted kinds are excluded. Policy changes reload immediately. Invalid local policy falls back to the shipped policy.

Rules use hard campaign boundaries. House rules take precedence over campaign homebrew, which takes precedence over the active system library. Rules tied to a campaign link are visible only to that campaign; rules without a campaign link must match the active system.

Pinned run, day, combat, attached, and active-note material is sent first. Relevant chunks are then added within the context budget and cited as wikilinks. Large pinned notes provide an outline and a link to indexed material.

The model can search and read scoped notes, find names, list notes, look up rules, inspect run or combat state, roll dice, and load a skill. These tools are read-only. House rules take precedence over campaign homebrew, which takes precedence over the system library.

Skills are Markdown files with `name` and `description` frontmatter. Put shared skills in `_local/assistant/skills/` or campaign skills in `Assistant/skills/` beneath the campaign. For example:

```markdown
---
name: tavern-scene
description: Describe a tavern scene.
---
Use three senses and offer one detail for each party member.
```

The lexical index is always local. Its cache is `.rpgvault/cache/assistant/` and can be rebuilt with the Assistant rebuild index command. The default embedding provider is none; no note text is sent to an embedding service by default.
