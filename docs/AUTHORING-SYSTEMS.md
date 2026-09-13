# Authoring systems

Create a package under `_local` while experimenting, then contribute a clean package to `_system` only when it has no rules text or published statblocks. A package declares shapes: supported note kinds, field names, template partials, and radar requirements.

For example, a `coc7e` package may define an investigator shape with `occupation` and `stability` fields. It must not reproduce game rules. Add a template rule and base for each new `type`, then run `doctor`.
