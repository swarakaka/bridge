# Concepts

## Modes

A request's `Accept` header selects one of four modes: `html`, `page`, `json`, `stream`. The precedence, tie-breaks and version parameter are specified in the [protocol reference](/guide/protocol). Controllers never inspect `Accept`.

## Representation and transport

`Bridge::render()` produces a **page**: a component name and a bag of props. That is the representation. A **representer** per mode turns it into a transport: the HTML shell, the page object, or the JSON envelope. Errors follow the same path through one error envelope.

Props are resolved with Laravel's own serialization: `JsonResource`, `ResourceCollection` (paginated collections keep `{data, links, meta}`), paginators, `Arrayable`, `JsonSerializable`, enums and dates. Bridge adds only delivery hints: `lazy`, `defer`, `always`, `merge`.

## What Bridge does not do

- It does not authenticate or authorize. Guards and policies run as usual; Bridge only maps their exceptions to each mode.
- It does not define resource shapes or an API specification.
- It does not set CORS headers.

## Client runtime

`@swarakaka/bridge-core` holds everything that is not view-layer binding: request manager, router, history, page store, forms, page cache and the stream client. Adapters such as `@swarakaka/bridge-vue` mirror the store into their reactivity system.
