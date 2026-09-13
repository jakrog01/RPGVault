# Assistant retrieval

The assistant indexes Markdown locally. Every query is filtered to the active run before it is ranked. A GM scope includes its run, campaign, party, shared system library, and campaign mechanics. A player scope includes only its run and party. Archive, shipped files, local overrides, application data, excluded notes, and player-hidden notes are never returned.

The shipped policy is `_system/assistant/scope.json`, and exactly matches the built-in fallback: GM access is `run`, `state`, `campaign`, `party`, `system`, `homebrew`, `house-rule`, and `note`; player access is `run`, `state`, `party`, and `note`. A local policy at `_local/assistant/scope.json` overrides it. Both use `{ "version": 1, "exclude": ["prefix/"], "gm": ["kind"], "player": ["kind"] }`; `exclude` is optional, and its vault-path prefixes supplement the built-in `Archive/`, `_system/`, `_local/`, `.obsidian/`, and `.rpgvault/` exclusions. Omitted kinds are excluded. The policy applies to every visible note, including rules outside the standard roots. Policy changes reload immediately. Invalid local policy falls back to the shipped policy.

Rules use hard campaign boundaries. Retrieval remains ordered by relevance; when rule chunks occupy scored positions, those positions are reordered as house rule, campaign homebrew, then active-system library. `lookup_rule` uses full precedence sorting. Rules tied to a campaign link are visible only to that campaign; rules without a campaign link must match the active system.

Pinned campaign, run, state, world day, combat, attached notes, and the active note are sent first and are never repeated in retrieval. The scope card and available skills follow. Relevant chunks are then added in score order within the total retrieval budget (estimated as one token per four characters) and cited as wikilinks. Large pinned notes provide an outline and a link to indexed material. The default character limit does not cut this budgeted context.

Every final answer has a Sources disclosure listing the retrieved notes and notes returned by tools. Select a source to open that note in Obsidian. Breadcrumb citations include the full heading path; headings inside fenced code blocks are not headings.

The model can search and read scoped notes, find names, list notes, look up rules, inspect run or combat state, roll dice, and load a skill. These tools are read-only. House rules take precedence over campaign homebrew, which takes precedence over the system library.

Skills are Markdown files with `name`, `description`, optional `system`, and optional `tools` frontmatter. They are loaded in order from `_system/assistant/skills/`, `_local/assistant/skills/`, and `<campaign>/Assistant/skills/`; later files with the same name override earlier ones. Invalid files are skipped and reported together. Skill changes, renames, deletions, and active-campaign changes reload the list automatically.

Free questions receive only skill names and descriptions. A model can load a full body with `load_skill`. The scene, NPC, passer-by, consequences, summary, and mechanics quick prompts include their matching skill body in their first request. For example:

```markdown
---
name: tavern-scene
description: Describe a tavern scene.
---
Use three senses and offer one detail for each party member.
```

The lexical index is always local. Its cache is `.rpgvault/cache/assistant/` and can be rebuilt with the Assistant rebuild index command. The default embedding provider is none; no note text is sent to an embedding service by default.
