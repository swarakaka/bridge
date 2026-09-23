# Representation and transport

Bridge separates _what a page means_ from _how it is sent_.

**Representation.** `Bridge::render()` produces a page: a component name and a bag of props. Props are resolved with Laravel's own serialization rules: `JsonResource`, `ResourceCollection` (paginated collections keep `{ data, links, meta }`), paginators, `Arrayable`, `JsonSerializable`, enums and dates. Bridge adds only delivery hints (`lazy`, `defer`, `always`, `merge`) and shared props. Errors are represented once as an error envelope with a status, a kind, a message and optional field errors.

**Transport.** A representer per mode turns the page or the error envelope into an HTTP response: the HTML shell, the page object, or the JSON document. Streams are a fourth transport for events.

This is why there is no Bridge "resource layer": the representation is Laravel's, and the transports are thin. It is also why a React or mobile client needs no server changes: they consume the same representation over a documented transport.

The client mirrors the split. `@swarakaka/bridge-core` holds the transport-facing runtime (requests, parsing, routing, forms, streams); view adapters bind its state to their reactivity model.
