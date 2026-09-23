# Asset versioning

When you deploy new JavaScript, clients still running the old bundle must reload. Bridge tracks a **build** identifier and forces a full document load when it changes.

## Server

The build is `Bridge::version()`, taken in order from `bridge.build.version` (`BRIDGE_BUILD_VERSION`), then a hash of the Vite manifest at `bridge.build.manifest` (default `public/build/manifest.json`). Set the environment variable in your deploy script or let the manifest hash change on every build.

## Protocol

- The shell embeds the build in the page object and in `<meta name="bridge-build">`.
- The client sends `X-Bridge-Build` on every page request.
- On a GET with a different build the server answers `409 Conflict` with `X-Bridge-Location: <url>` and no body; the client performs a full document load of that URL and picks up the new bundle.
- Non-GET requests are never rejected for a stale build: a submitted form is processed, and the redirect that follows triggers the reload.

Prefetch cache entries are dropped on a build conflict.

## Blade

```blade
<x-bridge::head />          {{-- emits the meta tags --}}
<x-bridge::head build="v42" /> {{-- override for special shells --}}
```
