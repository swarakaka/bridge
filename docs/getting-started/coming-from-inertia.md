# Coming from Inertia

Bridge borrows Inertia's developer experience: controllers return pages, page components receive props, there are forms, partial reloads, deferred props, prefetching and shared data. If you know Inertia you will feel at home. The differences are deliberate.

## What maps directly

| Inertia                                                                        | Bridge                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `Inertia::render()`                                                            | `Bridge::render()`                                                                                                              |
| `Inertia\Inertia` (facade), `Inertia\ResponseFactory` (service)                | `Bridge\Bridge` (facade), `Bridge\BridgeManager` (service)                                                                      |
| `Inertia::share()`                                                             | `Bridge::share()`                                                                                                               |
| `HandleInertiaRequests::share()` (`inertia:middleware`)                        | `HandleBridgeRequests::share()` (`bridge:middleware`), optional                                                                 |
| `Inertia::lazy()`, `Inertia::defer()`, `Inertia::always()`, `Inertia::merge()` | `Bridge::lazy()`, `Bridge::defer()`, `Bridge::always()`, `Bridge::merge()`                                                      |
| `@inertia`, `@inertiaHead`                                                     | `@bridge`, `@bridgeHead`, or `<x-bridge::app />`, `<x-bridge::head />`                                                          |
| `createInertiaApp`                                                             | `createBridgeApp`                                                                                                               |
| `<Link>`                                                                       | `<BridgeLink>`                                                                                                                  |
| `router.visit()` and friends                                                   | `router.visit()` and friends                                                                                                    |
| `useForm()`                                                                    | `useForm()` (`form.name` or `form.data.name` in Vue, `form.data.name` in React)                                                 |
| `usePage()`, `useRemember()`                                                   | `usePage()`, `useRemember()`                                                                                                    |
| `useHttp()`                                                                    | `useJsonForm()` for form state, `useJson()` for plain requests (see [JSON mode](/beyond/json-mode#forms-over-json-usejsonform)) |
| `<Deferred>`                                                                   | `<Deferred>`                                                                                                                    |
| `<Head>`                                                                       | `<BridgeHead>`                                                                                                                  |
| `X-Inertia-Version`                                                            | `X-Bridge-Build`                                                                                                                |
| `X-Inertia-Partial-Data`, `X-Inertia-Partial-Component`                        | `X-Bridge-Only`, `X-Bridge-Except`, `X-Bridge-Component`                                                                        |

## What is different, and why

**Mode selection uses `Accept`, not a marker header.** The page media type `application/vnd.bridge+json; v=1` is the marker, so no `X-Inertia: true` equivalent exists and `Vary: Accept` is the caching mechanism. See [Modes and negotiation](/core-concepts/modes). As with Inertia, `$request->wantsJson()` is `false` during a page visit, so Fortify and other packages redirect instead of answering with JSON.

**JSON mode is part of the protocol.** Any client that sends `Accept: application/json` gets `{ data, meta }` with Laravel-native resource shapes from the same controllers. There are no API controllers to write. See [JSON mode](/beyond/json-mode).

**Validation returns 422 directly in page and JSON mode.** Inertia redirects back and puts errors in the session; Bridge answers the request with the errors. Fewer round trips, no session dependency, so bearer-token clients behave exactly like browsers, and no error bags to juggle. Classic HTML posts keep Laravel's redirect-back. See [Validation](/basics/validation).

**Real-time is a first-class mode.** Streams are server-sent events with an event bus interface, invalidate-first semantics, replay and bounded connections. See [Streams](/realtime/streams).

**The client runtime is framework-agnostic.** `@swarakaka/bridge-core` holds the router, forms, cache and stream client; `@swarakaka/bridge-vue` is bindings only, and a React adapter needs no server changes. See [Writing an adapter](/reference/adapters).

**Form fields are also available under `form.data`.** As in Inertia, Vue forms expose each field on the form object (`v-model="form.name"`), and `form.data.name` is the same value. A field named like a form member (`errors`, `processing`, `data`, `reset`, `transform`, `progress`, ...) makes `useForm` throw instead of silently shadowing it; see [Reserved field names](/basics/forms#reserved-field-names). React forms use `form.data` and `setData`.

**A few form names differ.** `useForm('key', data)`, `resetAndClearErrors` and `dontRemember` work as in Inertia. `form.defaults` is the stored default values, not a method: call `form.setDefaults()` (no argument, or an object of values). Validation errors go to `onInvalid`, and `onError` only fires for other errors (403, 500, ...), so move an Inertia `onError` validation handler to `onInvalid`; Bridge logs a console warning when a `422` reaches a call that passed only `onError`. React's `setData(prev => ...)` works; the returned values are merged into the data. Precognition works as in Inertia (`useForm(method, url, data)` or `withPrecognition`, `validate`, `touch`, `touched`, `valid`, `invalid`, `setValidationTimeout`, `validateFiles`), with two names that differ: the validation callback is `onInvalid`, not `onValidationError`, and all messages per field are always in `form.allErrors` instead of `withAllErrors()`.

**Visit options.** `preserveUrl`, `showProgress`, `queryStringArrayFormat` and `invalidateCacheTags` (with `cacheTags` on `BridgeLink` and `router.prefetch`, and `router.flushByCacheTags`) work as in Inertia, with two differences. Arrays in GET query strings default to `indices` (`tags[0]=a`) rather than `brackets`; pass `queryStringArrayFormat: 'brackets'` for Inertia's format. Bridge clears the whole prefetch cache after every successful mutation, so `invalidateCacheTags` only adds something on GET visits. `router.clearCache()` is `router.flushAll()`, and Bridge has no built-in progress bar: indicators you build from router events check `visit.showProgress`. After a successful submit the current values become the new defaults unless `resetOnSuccess` is set.

**Merge props are opt-in per visit.** A "load more" visit passes `merge: true`; invalidations and searches replace. See [Merging props](/data/merging-props).

**No history encryption, polling, "load when visible" or "once" props yet.** Streams cover most polling use cases; the others are candidates for later releases.
