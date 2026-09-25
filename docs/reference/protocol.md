# Protocol

The normative specification lives in the repository under `packages/protocol/spec`, with JSON Schemas in `packages/protocol/schemas` and golden fixtures in `packages/protocol/fixtures`. Both the PHP and TypeScript test suites validate against the same fixtures. Where the specification and an implementation disagree, the implementation is wrong.

| Document         | Covers                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `negotiation.md` | How `Accept` selects a mode, tie-breaks, the `v` parameter, 406 rules                                                                     |
| `headers.md`     | Every request and response header, standard and custom                                                                                    |
| `page.md`        | The page object, embedded shell, partial responses, deferred, merge, once and watched props, build conflicts, redirects, caching, history |
| `json.md`        | The `{ data, meta }` envelope, value shapes, mutation results                                                                             |
| `errors.md`      | The error envelope and its representation per mode                                                                                        |
| `stream.md`      | Framing, control events, watch tags, heartbeats, ids and replay, reconnection, channels, authentication                                   |
| `versioning.md`  | Protocol versioning and compatibility rules                                                                                               |

## Summary

- Media types: `application/vnd.bridge+json; v=1`, `application/json`, `text/event-stream`, `text/html`.
- Custom request headers: `X-Bridge-Build`, `X-Bridge-Only`, `X-Bridge-Except`, `X-Bridge-Component`, `X-Bridge-Once`, `X-Bridge-Client`. Custom response header: `X-Bridge-Location`.
- Page object: `protocol`, `type`, `component`, `url`, `props`, `build`, optional `deferred` and `meta`.
- Error object: `protocol`, `type: "error"`, `error: { status, kind, message, errors?, redirect?, retryAfter? }`.
- Control events: `ready`, `invalidate` (with optional watch `tags` and `client`), `prop`, `notification`, `navigate`, `progress`, `error`, `end`.
- Additive changes never bump the protocol version; unknown members, kinds and control types are ignored by clients.
- HTML shells mark server-rendered roots with `data-server-rendered="true"`; clients mark hydration with `data-bridge-hydrated="true"`.

## Example session

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
data: {"type":"end","reason":"max_duration","reconnect":true}
```
