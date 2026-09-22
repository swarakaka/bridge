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

| `type`         | Members                                                                                                                       | Emitted when                                             | Default client behaviour                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ready`        | `protocol` (int), `replayed` (bool), `heartbeat` (ms), `maxDuration` (ms \| null)                                             | First event on every connection.                         | If `replayed` is `false` and this connection is a reconnect, resync (§6).                                      |
| `invalidate`   | `keys`: string[] \| `"*"`                                                                                                     | Named page props are stale.                              | Partial reload of the listed keys (coalesced); `"*"` reloads all. Ignore keys not present on the current page. |
| `prop`         | `key` (string), `value` (any), `mode`: `replace` \| `merge` \| `append` \| `prepend` (default `replace`)                      | Server pushes a prop value.                              | Apply to the page store if `key` exists on the current page.                                                   |
| `notification` | `level`: `info` \| `success` \| `warning` \| `error`; `message` (string); `title` (string \| null); `meta` (object, optional) | User-facing message.                                     | Emit to the application.                                                                                       |
| `navigate`     | `url` (string), `replace` (bool, default false)                                                                               | Server-initiated navigation.                             | Visit `url` if same-origin; otherwise ignore unless the application opted in.                                  |
| `progress`     | `id` (string), `value` (number 0–1 \| null), `label` (string \| null)                                                         | Long-running operation progress.                         | Emit to the application.                                                                                       |
| `error`        | `status`, `kind`, `message`, `final` (bool)                                                                                   | Stream-level error.                                      | Emit; if `final`, do not reconnect.                                                                            |
| `end`          | `reason`: `max_duration` \| `server_shutdown` \| `unauthorized` \| `closed`; `reconnect` (bool)                               | Orderly close; server closes the connection right after. | Reconnect immediately (no backoff) when `reconnect` is `true`.                                                 |

Clients MUST ignore control events with an unknown `type`.

## 4. Heartbeat

The server sends the comment line `: hb` whenever no bytes have been written for `heartbeat` milliseconds. Heartbeats carry no `id` and are not events. Clients that can observe raw bytes (fetch-based clients) SHOULD use any received bytes to reset a liveness timer and SHOULD reconnect after `heartbeatTimeout × heartbeat` milliseconds of silence (recommended factor 2.5). Native `EventSource` clients cannot observe comments and rely on the browser's connection handling.

## 5. Identifiers, `Last-Event-ID`, and replay

- Events originating from the event bus carry an `id` that is an opaque, monotonically increasing cursor within a connection. Locally generated events (`ready`, `end`, heartbeat) carry no `id`.
- On reconnect the client sends `Last-Event-ID: <last id seen>`.
- If the server can replay, it emits every event after that id (subject to current authorization) before resuming live delivery, and sets `replayed: true` in `ready`. Otherwise it sets `replayed: false`.
- `id` values grant no authority. Every (re)connection is a new HTTP request and is authenticated and authorized afresh. Replayed events are filtered by the channels the connection is authorized for **now**.

## 6. Reconnection

Clients MUST implement:

1. Exponential backoff with jitter after an abnormal close. Recommended: initial 1000 ms (or the last `retry:` value), factor 2, maximum 30 000 ms, jitter ±30 %.
2. Immediate reconnect (no backoff) after `end` with `reconnect: true`.
3. No automatic reconnect after `error` with `final: true`, or after HTTP `401`/`403` on the connection request.
4. **Resync** when `ready.replayed` is `false` on a reconnect: reload every page prop the client watches (equivalent to `invalidate: "*"` scoped to the current page), because events may have been missed.

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

id: 1758542400987-0
event: customer.created
data: {"id":12,"name":"Acme"}

event: bridge
data: {"type":"notification","level":"success","title":null,"message":"Customer saved"}

event: bridge
data: {"type":"end","reason":"max_duration","reconnect":true}

```
