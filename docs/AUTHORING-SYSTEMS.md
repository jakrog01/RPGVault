# Authoring systems

Start an experimental system package under `_local`, then ship it only when it contains structure rather than published rules text or published statblocks. A shipped package lives at `_system/systems/<id>/package.json`; its `id` and `name` identify the system.

## Describe shapes and fields

The package's `noteTypes` lists the note shapes it supports. Its `requiredFrontmatter` maps a shape to the fields that must be present, such as `system` for a campaign or creature and `role` plus `campaign` for a run. These fields let the vault recognise the note without copying game rules into the package.

Keep shapes small and explicit. A package may describe a creature, spell, item, campaign, party, run, or another supported note kind, but it should not embed a rulebook, monster entry, or other published rules material. Put a user's actual mechanics notes in their content roots.

Use the same field names in templates and examples so a newly created note passes its expected shape without manual repair.

## Templates, bases, and radar

Add a template rule for every new note type so the matching path receives the intended template. Each template's `type` needs a matching base definition; `doctor` reports a template type that has no base. Use path-qualified links for contractual names that can occur in more than one place.

Decide whether the shape contributes to the GM radar's campaign, party, run, or shared context, or to the player radar's recorded claims. Bulk mechanics folders can be searchable while excluded from radar completeness checks; do not make an authoring shortcut that turns player claims into GM truth.

Keep package metadata, template rules, bases, and radar expectations together in the release review so their contracts stay aligned.

Run `node _system/bin/rpgvault.mjs doctor` after changing a package, template rule, or base. It verifies the package-facing template and base relationships alongside roots, owned paths, and other vault contracts before the system is shipped.

Fix every reported contract violation before publishing the package.
