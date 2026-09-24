# Versioning

## Protocol

The page representation and the stream control events are versioned together as the protocol version, an integer starting at `1`. It appears as `v=1` on the page media type, as `protocol` in page, error and `ready` bodies, and as `<meta name="bridge-protocol">` in the shell.

- Additive changes (new optional members, new control event types, new error kinds) do not bump the version. Clients ignore what they do not know.
- Breaking changes bump it. A server that does not support the requested version answers `406`, and the client performs a full document load, which delivers a shell whose bundled client matches the server.

## Packages

Packages follow semver independently of the protocol. The Laravel package (`swarakaka/bridge-laravel`) is tagged `laravel-vX.Y.Z` in this repository and published as `vX.Y.Z` from its read-only split repository; the npm packages (`@swarakaka/bridge-protocol`, `@swarakaka/bridge-core`, `@swarakaka/bridge-vue`) are versioned together with changesets and released by pushing a `vX.Y.Z` tag. `@swarakaka/bridge-react` is pre-1.0 and experimental.

## JSON mode

JSON mode is your application's API and is versioned by your application.
