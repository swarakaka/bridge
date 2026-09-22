# Versioning

- **Protocol version** (`v=1` on the page media type, `protocol` in bodies and in the stream `ready` event) changes only on breaking changes. Additive members, control types and error kinds never bump it. A server that does not support the requested version answers `406`, and the client performs a full document load.
- **Packages** follow semver independently. The Laravel package (`swarakaka/bridge-laravel`) is tagged `laravel-vX.Y.Z`; the npm packages (`@swarakaka/bridge-protocol`, `@swarakaka/bridge-core`, `@swarakaka/bridge-vue`) are versioned together with changesets.
- **JSON mode** is your application's API and is versioned by your application.
