# RPGVault concepts

RPGVault is an Obsidian vault with a shipped layer, a local layer, and content roots.
The boundary lets the template evolve without treating game notes as generated files.
Use the layer and root names below when deciding where to place a file.

## Layers and the resolver

`_system/` is the shipped implementation: templates, plugin source, scripts, bases, demo material, and systems.
An update backs up and replaces `_system/`, so never put private notes or local edits there.
`_local/` is the vault-owned override layer and is not replaced by update.
The Table Tools resolver checks `_local/<path>` before `_system/<path>` for overrideable material.
For example, a local template with the same name takes precedence over the shipped template.
Keep private scripts, template changes, and local assistant policy in `_local/`.
The `.obsidian/` directory is Obsidian application configuration, not a content root.

## Content roots

The manifest declares six content roots: `Campaigns`, `Parties`, `Runs`, `Library`, `Calendar`, and `Archive`.
`Campaigns/` holds reusable world and campaign material.
`Parties/` holds rosters and party records.
`Runs/` holds table-specific session and run records.
`Library/` holds mechanics and assets, including reference material under its declared folders.
`Calendar/` holds calendar-oriented vault content used with the table workflow.
`Archive/` keeps retired material and is excluded from automation and assistant indexing.
Content roots are user content: update does not replace them.
The manifest also creates supporting local template and script folders, but they are not content roots.

## Campaigns, parties, and runs

A campaign is the reusable setting and world context for a game.
A party is the group of characters participating in that game.
A run is the table-specific record that connects a role, campaign, and party.
Make a run active when it is the game currently being played.
The active run controls the assistant and combat context used by Table Tools.
`Active.md` at the vault root is the pointer to that active run.
It is user state rather than shipped `_system` state, so it survives updates.

## Names, systems, and state

Contractual names are allowed to repeat when their paths disambiguate them.
The manifest lists `Active.md`, `Campaign.md`, `Party.md`, `Run.md`, `State.md`, `Dashboard.md`, `Radar.md`, and `World Day.md` as contractual names.
Generated references to those repeated names should be path-qualified.
System packages in `_system/systems/` describe supported note shapes and radar requirements.
They do not contain published rules text or statblocks.
Use a local package while experimenting; see [Authoring systems](AUTHORING-SYSTEMS.md) for that workflow.
`.rpgvault/state.json` records install identity, installed version, applied migrations, and adoption state.
`.rpgvault/cache/` holds local derived caches, including assistant indexing data.
`.rpgvault/backups/` receives a timestamped copy of `_system/` before an update replaces it.
An update may replace `_system/`, reconcile manifest-managed Obsidian artifacts, refresh the bundled plugin, and write state.
An update does not replace `_local/`, the six content roots, or the root active pointer.

## Useful next pages

Follow [Getting started](GETTING-STARTED.md) to create the first campaign, party, and run.
Use the [Table home](HOME.md) page for the Table Tools creation controls.
Use the [CLI reference](CLI.md) before operating the vault from a terminal.
Use [Troubleshooting](TROUBLESHOOTING.md) whenever `doctor` reports a violation.
