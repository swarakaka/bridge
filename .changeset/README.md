# Changesets

The npm packages (`@swarakaka/bridge-protocol`, `-core`, `-vue`, `-react`) always share one version (a `fixed` group in `config.json`). Changesets only decide the version bump; the `CHANGELOG.md` files are kept empty (`"changelog": false`). Run `pnpm changeset` in a PR that changes a package. The Laravel package (`swarakaka/bridge-laravel`) uses the same version numbers and is released with a `laravel-vX.Y.Z` tag. See `CONTRIBUTING.md`, "Releasing".
