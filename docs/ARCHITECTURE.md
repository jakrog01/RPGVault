# Architecture

`_system` is owned by RPGVault and is replaced wholesale. Do not put user work there. `_local` mirrors `_system`; the single resolver checks `_local/<path>` first and then `_system/<path>`. This preserves custom templates, localised templates, and private scripts during updates.

Campaigns contain reusable world material. Parties contain rosters. Runs contain table-specific records. Library holds mechanics and assets, Calendar holds table-plugin data, and Archive is excluded from automation.

System packages describe note shapes and radar requirements. They never contain published rules text or statblocks.

The GM radar checks campaign, party, run, and shared context. The player radar records claims with `about`, `what`, `from`, `session`, and `status`; it does not treat player prose as GM truth. Bulk reference folders remain searchable but are excluded from completeness checks. Contractual names such as `Run.md` and `World Day.md` may repeat and every generated reference to them is path-qualified.
