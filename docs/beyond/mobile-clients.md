# Mobile and native clients

A native client needs no Bridge SDK: JSON mode is a plain API and streams are standard server-sent events. This page is the checklist for building one. The golden fixtures in `packages/protocol/fixtures` are offline test data for parsers.

## Requests

- Send `Accept: application/json` and `Authorization: Bearer <token>` (a Sanctum personal access token or any guard your app uses).
- Optional: `X-Bridge-Only: a,b` to trim payloads; `If-None-Match` with the returned `ETag` for `304` responses.
- Read `{ data, meta? }`. `data` mirrors the page's props with Laravel-native shapes; paginated collections are `{ data, links, meta }`.
- Mutations return `200` or `201` with a `Location` header and `{ data, meta: { location, flash? } }`, never a redirect.
- Errors are Laravel's: `{ message, errors? }`; `422` validation, `401`, `403`, `404`, `429` with `Retry-After`.

## Streams

- `GET /events` with `Accept: text/event-stream` and the bearer token; or, when the platform's SSE client cannot set headers, obtain a signed ticket and open that URL. See [The stream client](/realtime/client).
- Parse standard SSE frames. The reserved event name `bridge` carries control messages (`ready`, `invalidate`, `prop`, `notification`, `navigate`, `progress`, `error`, `end`); other names are application events with JSON data. Comment lines (`: hb`) are heartbeats.
- Keep the last `id:` and send `Last-Event-ID` when reconnecting. Reconnect immediately after `end{reconnect:true}`, with backoff after a dropped connection, never after `error{final:true}` or a `401`/`403`.
- Treat the subscription as live only after `ready`. If `ready.replayed` is `false` on a reconnect that was not orderly, refetch what you show.
- Apply `invalidate` by re-requesting the named props (JSON mode with `X-Bridge-Only`), `prop` by patching local state, `notification` as UI.

## Fixtures and shared code

`packages/protocol/fixtures/json/*.json` and `fixtures/stream/*.txt` are the exact bytes the server produces for the documented cases; `packages/protocol/schemas` validates them. A React Native app can use `@swarakaka/bridge-core` directly: it depends only on `fetch` and `TextDecoder`.
