# Maintaining releases

This page is for maintainers preparing a release. Owners who need to update a vault should follow [Keeping a vault up to date](UPDATING.md).

## Cut a release

Finish the release changes, rebuild the shipped plugin, and run the repository test suite and `doctor` before cutting the release. Update the shipped version consistently with the release version, then create and push a `v*` tag such as `v1.2.0`.

The release workflow runs `npm test`, packages the repository as `RPGVault.zip`, and creates the GitHub release from that tagged commit. The tag is the boundary: do not change the release contents after the tag has been cut.

## Keep migrations permanent

Migration IDs are immutable. Never edit or reuse an existing migration: an installed vault records completed IDs and will not run an edited migration again. Put a repair in a new migration. The CLI already installed in a vault performs the initial replacement, and only the newly installed CLI runs pending migrations.

Review a migration against an already-updated vault as well as a fresh one. The update process records completed migration IDs in `.rpgvault/state.json`, so reuse would make a changed migration invisible to vaults that already recorded it.

## What the tag triggers

Pushing a `v*` tag triggers the release workflow after its `package` job has passed `npm test`. It publishes the release archive and builds the documentation site for GitHub Pages. Repository settings must enable GitHub Pages with **Source: GitHub Actions** once before the first deployment.

The released archive is the input to both online and offline owner updates. Keep it complete: it must contain the shipped `_system/` layer and its matching version so the updater can validate it.
