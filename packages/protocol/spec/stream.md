# Stream mode

Stream mode delivers server-sent events over a long-lived HTTP response. It is selected by `Accept: text/event-stream` on a streaming route.

## 1. Transport

- Response status `200`, `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. On HTTP/1.1 the server SHOULD send `Connection: keep-alive`.
- Framing follows the WHATWG Server-Sent Events specification: fields `event`, `data`, `id`, `retry`; lines starting with `:` are comments; an empty line dispatches the event. Line endings are `\n`.
- `data` is always a single line of JSON. Multi-line `data` MUST NOT be used by servers; clients MUST still join multi-line data with `\n` as the SSE specification requires.

## 2. Event names

- `bridge` is **reserved** for control events (§3). Its `data` is a JSON object with a `type` member.
- Any other event name is an **application event**. Its `data` is application-defined JSON. Application event names SHOULD be dot-separated lower-case (`customer.created`).
- Events without an `event` field (the SSE default `message`) MUST NOT be sent by Bridge servers.

## 3. Control events

All control events are `event: bridge`. The `data` object always has `type`. The schema is `schemas/stream-control.schema.json`.

| `type`         | Members                                                                                                                       | Emitted when                                               | Default client behaviour                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`        | `protocol` (int), `replayed` (bool), `heartbeat` (ms), `maxDuration` (ms \| null)                                             | First event on every connection.                           | If `replayed` is `false` and this connection is a reconnect, resync (§6).                                                                             |
| `invalidate`   | `keys`: string[] \| `"*"`; `tags`: string[] (optional, §3.1); `client`: string (optional, §3.2)                               | Named page props, or data behind watched props, are stale. | Partial reload of the listed keys and of the props watching a listed tag (coalesced); `"*"` reloads all. Ignore keys not present on the current page. |
| `prop`         | `key` (string), `value` (any), `mode`: `replace` \| `merge` \| `append` \| `prepend` (default `replace`)                      | Server pushes a prop value.                                | Apply to the page store if `key` exists on the current page.                                                                                          |
| `notification` | `level`: `info` \| `success` \| `warning` \| `error`; `message` (string); `title` (string \| null); `meta` (object, optional) | User-facing message.                                       | Emit to the application.                                                                                                                              |
| `navigate`     | `url` (string), `replace` (bool, default false)                                                                               | Server-initiated navigation.                               | Visit `url` if same-origin; otherwise ignore unless the application opted in.                                                                         |
| `progress`     | `id` (string), `value` (number 0–1 \| null), `label` (string \| null)                                                         | Long-running operation progress.                           | Emit to the application.                                                                                                                              |
| `error`        | `status`, `kind`, `message`, `final` (bool)                                                                                   | Stream-level error.                                        | Emit; if `final`, do not reconnect.                                                                                                                   |
| `end`          | `reason`: `max_duration` \| `server_shutdown` \| `unauthorized` \| `closed`; `reconnect` (bool)                               | Orderly close; server closes the connection right after.   | Reconnect immediately (no backoff) when `reconnect` is `true`.                                                                                        |

Clients MUST ignore control events with an unknown `type`.

### 3.1 Watch tags

`invalidate` MAY carry `tags`: watch tags ([page.md](page.md) §13) of data that changed. `keys` MUST then still be present and MAY be empty; without `tags`, `keys` MUST NOT be empty. A client that does not know `tags` reloads nothing for an empty `keys`, which is the safe fallback.

A published tag is `<tag>`, `<tag>.<key>`, or `<tag>.*` ("some record of this kind"). A client selects every prop of the current page whose `meta.watch` entry contains a tag that the published tag matches:

- the two are equal, or
- the published tag is `<tag>.*` and the watched tag is `<tag>` or starts with `<tag>.`.

Servers publishing a change to one record SHOULD send both `<tag>` and `<tag>.<key>`, so props watching the whole kind and props watching the record both match. The selected props are reloaded like the props named in `keys`, and the two sets are coalesced into one reload.

### 3.2 Changes made by the client itself

A client that just made a change usually already shows its result (a redirect after a form submission returned a fresh page). To avoid a second reload, an `invalidate` published for a change made during a request that carried `X-Bridge-Client` ([headers.md](headers.md)) MAY carry `client: "<hash>.<seq>"`:

- `<seq>` is the request number from the header, unchanged.
- `<hash>` is the base64url encoding, without padding, of the first 16 bytes of SHA-256 over the header's token (its ASCII bytes). Servers MUST NOT publish the token itself.

Servers MUST NOT add `client` for changes made outside that request (queued jobs, commands, later requests).

A client that receives an `invalidate` whose `<hash>` equals the hash of its own token, and whose `<seq>` is `N`:

1. MUST wait until request `N` has settled and its response, if any, has been applied.
2. MAY skip a prop selected by the message when the value it shows was delivered by the response to request `N` itself (including a redirect followed by that request), or by a request it started after request `N` settled.
3. MUST reload every other selected prop, and MUST reload them all when it does not know request `N`.

Values restored from history, filled from a once store, set by optimistic updates or patched in from other responses do not count as delivered. Clients that do not implement this section reload every selected prop.

## 4. Heartbeat

The server sends the comment line `: hb` whenever no bytes have been written for `heartbeat` milliseconds. Heartbeats carry no `id` and are not events. Clients that can observe raw bytes (fetch-based clients) SHOULD use any received bytes to reset a liveness timer and SHOULD reconnect after `heartbeatTimeout × heartbeat` milliseconds of silence (recommended factor 2.5). Native `EventSource` clients cannot observe comments and rely on the browser's connection handling.

## 5. Identifiers, `Last-Event-ID`, and replay

- Events originating from the event bus carry an `id` that is an opaque, monotonically increasing cursor within a connection. Locally generated events (`ready`, `end`, heartbeat) carry no `id`, with one exception: when the bus can replay, `end{reason:"max_duration"}` carries the connection's current cursor as its `id`, so the reconnect replays events published in the gap even if the connection delivered none. A bus event that becomes visible after an event with a higher `id` was sent (for example a database row committed late) is sent without an `id`, so the client's `Last-Event-ID` never moves backwards.
- On reconnect the client sends `Last-Event-ID: <last id seen>`. A client that cannot set the header on a new connection (a new native `EventSource`) MAY send the query parameter `lastEventId` instead; servers MUST accept it and MUST prefer the header when both are present. The id carries no authority, so exposing it in URLs and logs is harmless.
- If the server can replay, it emits every event after that id (subject to current authorization) before resuming live delivery, and sets `replayed: true` in `ready`. Otherwise it sets `replayed: false`. A server MUST NOT set `replayed: true` when retention (pruning, trimming) may have dropped events after that id, or when it cannot interpret the id; the client then resyncs.
- `id` values grant no authority. Every (re)connection is a new HTTP request and is authenticated and authorized afresh. Replayed events are filtered by the channels the connection is authorized for **now**.

## 6. Reconnection

Clients MUST implement:

1. Exponential backoff with jitter after an abnormal close. Recommended: initial 1000 ms (or the last `retry:` value), factor 2, maximum 30 000 ms, jitter ±30 %.
2. Immediate reconnect (no backoff) after `end` with `reconnect: true`.
3. No automatic reconnect after `error` with `final: true`, or after HTTP `401`/`403` on the connection request.
4. **Resync** when `ready.replayed` is `false` on a reconnect: reload every page prop the client watches (equivalent to `invalidate: "*"` scoped to the current page), because events may have been missed. A client MAY skip the resync when the previous connection ended with `end` and it had no `id` to send as `Last-Event-ID`: the server could not replay anything, and there was nothing to miss (a bus without replay).

A server that refuses a connection for capacity (too many open streams for the subject) sends `ready`, then `error{status:429, kind:"throttled", final:false}`, and closes **without** `end`, so the client backs off (starting at the advertised `retry`) instead of reconnecting immediately.

Servers SHOULD bound connection lifetime (`maxDuration`) and end connections with `end{reason:"max_duration", reconnect:true}`; clients treat this as routine.

## 7. Channels

A stream subscribes to one or more channels. Channel membership is decided by the server for each connection. Clients MAY request additional channels through a query parameter `channels` (comma-separated); the server MUST authorize every requested channel and MUST end the stream with `error{kind:"forbidden", final:true}` if any is not authorized.

Channel names are opaque strings; the recommended convention is dot-separated segments (`customers`, `user.42`, `tenant.7.orders`).

## 8. Authentication

The connection request is authenticated by the application's guards like any request.

- Cookie sessions work with both fetch-based and native `EventSource` clients.
- Bearer tokens require a client that can set `Authorization`; native `EventSource` cannot. For such clients servers MAY issue a **stream ticket**: a short-lived (recommended ≤ 60 s) signed URL bound to the user and the requested channels, obtained through an authenticated request, and valid only for opening a stream. Long-lived credentials MUST NOT be placed in stream URLs.

## 9. Example session

```
retry: 3000
event: bridge
data: {"type":"ready","protocol":1,"replayed":false,"heartbeat":15000,"maxDuration":60000}

: hb

id: 1758542400123-0
event: bridge
data: {"type":"invalidate","keys":["customers"]}

id: 1758542400555-0
event: bridge
data: {"type":"invalidate","keys":[],"tags":["customers","customers.12"],"client":"ZnlfgKAmTkeQjF2rdZN7Lg.7"}

id: 1758542400987-0
event: customer.created
data: {"id":12,"name":"Acme"}

event: bridge
data: {"type":"notification","level":"success","title":null,"message":"Customer saved"}

event: bridge
data: {"type":"end","reason":"max_duration","reconnect":true}

```
