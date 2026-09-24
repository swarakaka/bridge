# Coming from Inertia

Bridge borrows Inertia's developer experience: controllers return pages, page components receive props, there are forms, partial reloads, deferred props, prefetching and shared data. If you know Inertia you will feel at home. The differences are deliberate.

## What maps directly

| Inertia                                                                        | Bridge                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `Inertia::render()`                                                            | `Bridge::render()`                                                             |
| `Inertia::share()`                                                             | `Bridge::share()`                                                              |
| `Inertia::lazy()`, `Inertia::defer()`, `Inertia::always()`, `Inertia::merge()` | `Bridge::lazy()`, `Bridge::defer()`, `Bridge::always()`, `Bridge::merge()`     |
| `@inertia`, `@inertiaHead`                                                     | `@bridge`, `@bridgeHead`, or `<x-bridge::app />`, `<x-bridge::head />`         |
| `createInertiaApp`                                                             | `createBridgeApp`                                                              |
| `<Link>`                                                                       | `<BridgeLink>`                                                                 |
| `router.visit()` and friends                                                   | `router.visit()` and friends                                                   |
| `useForm()`                                                                    | `useForm()` (values live under `form.data`)                                    |
| `usePage()`, `useRemember()`                                                   | `usePage()`, `useRemember()`                                                   |
| `useHttp()`                                                                    | `useJson()` (JSON mode on the same routes, see [JSON mode](/beyond/json-mode)) |
| `<Deferred>`                                                                   | `<Deferred>`                                                                   |
| `<Head>`                                                                       | `<BridgeHead>`                                                                 |
| `X-Inertia-Version`                                                            | `X-Bridge-Build`                                                               |
| `X-Inertia-Partial-Data`, `X-Inertia-Partial-Component`                        | `X-Bridge-Only`, `X-Bridge-Except`, `X-Bridge-Component`                       |

## What is different, and why

**Mode selection uses `Accept`, not a marker header.** The page media type `application/vnd.bridge+json; v=1` is the marker, so no `X-Inertia: true` equivalent exists and `Vary: Accept` is the caching mechanism. See [Modes and negotiation](/core-concepts/modes). As with Inertia, `$request->wantsJson()` is `false` during a page visit, so Fortify and other packages redirect instead of answering with JSON.

**JSON mode is part of the protocol.** Any client that sends `Accept: application/json` gets `{ data, meta }` with Laravel-native resource shapes from the same controllers. There are no API controllers to write. See [JSON mode](/beyond/json-mode).

**Validation returns 422 directly in page and JSON mode.** Inertia redirects back and puts errors in the session; Bridge answers the request with the errors. Fewer round trips, no session dependency, so bearer-token clients behave exactly like browsers, and no error bags to juggle. Classic HTML posts keep Laravel's redirect-back. See [Validation](/basics/validation).

**Real-time is a first-class mode.** Streams are server-sent events with an event bus interface, invalidate-first semantics, replay and bounded connections. See [Streams](/realtime/streams).

**The client runtime is framework-agnostic.** `@swarakaka/bridge-core` holds the router, forms, cache and stream client; `@swarakaka/bridge-vue` is bindings only, and a React adapter needs no server changes. See [Writing an adapter](/reference/adapters).

**Form values live under `form.data`.** Inertia flattens fields onto the form object; Bridge keeps them under `data` so field names can never collide with form methods.

**Merge props are opt-in per visit.** A "load more" visit passes `merge: true`; invalidations and searches replace. See [Merging props](/data/merging-props).

**No history encryption, polling, "load when visible" or "once" props yet.** Streams cover most polling use cases; the others are candidates for later releases.
