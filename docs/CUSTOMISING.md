# Customising Table Tools

Keep personal changes in `_local` or the content roots. The local layer mirrors shipped paths and wins during resolution, so it is the durable place for overrides that should survive updates. Do not put owner material in `docs/`, `.github/`, `Home.md`, `README.md`, or `CHANGELOG.md`: they are shipped paths and updates replace or mirror them after making a backup.

## Labels and templates

To override selected Table Tools labels, create `_local/plugins/table-tools/strings.json`. The plugin reads it at load time. Unknown keys are ignored; malformed JSON leaves the English strings active and shows a notice.

```json
{
  "combat": "Encounter",
  "openCombat": "Open encounter tracker",
  "assistant": "Game assistant"
}
```

Use `_local/templates` for local versions of templates and `_local/scripts` for private scripts. The rest of the `_local` mirror can hold another shipped-path override when the resolver supports it. Keep normal table notes in the declared content roots rather than in any infrastructure layer.

## Obsidian additions

Your own community plugins, themes, snippets, and their settings remain in the vault through updates. Updates reconcile only the Obsidian artifacts the manifest manages; they do not remove local plugin ids or user appearance files.

Template community plugins are an exception: the shipped template requires them to stay enabled. `doctor` checks that `community-plugins.json` is a list of strings and reports missing required template plugins. It also checks declared roots, shipped ownership, templates, bases, and the freshness of the bundled plugin, so run it after a structural customisation.
