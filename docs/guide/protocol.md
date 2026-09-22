# Protocol reference

The normative specification lives in the repository under `packages/protocol/spec`, with JSON Schemas in `packages/protocol/schemas` and golden fixtures in `packages/protocol/fixtures`. Both the PHP and TypeScript test suites validate against the same fixtures.

| Document         | Covers                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `negotiation.md` | How `Accept` selects a mode, tie-breaks, the `v` parameter, 406 rules                                             |
| `headers.md`     | Every request and response header, standard and custom                                                            |
| `page.md`        | The page object, embedded shell, partial responses, deferred and merge props, build conflicts, redirects, caching |
| `json.md`        | The `{ data, meta }` envelope, value shapes, mutation results                                                     |
| `errors.md`      | The error envelope and its representation per mode                                                                |
| `stream.md`      | Framing, control events, heartbeats, ids and replay, reconnection, channels, authentication                       |
| `versioning.md`  | Protocol versioning and compatibility rules                                                                       |

## Summary

- Media types: `application/vnd.bridge+json; v=1`, `application/json`, `text/event-stream`, `text/html`.
- Custom request headers: `X-Bridge-Build`, `X-Bridge-Only`, `X-Bridge-Except`, `X-Bridge-Component`. Custom response header: `X-Bridge-Location`.
- Page object: `protocol`, `type`, `component`, `url`, `props`, `build`, optional `deferred` and `meta`.
- Control events: `ready`, `invalidate`, `prop`, `notification`, `navigate`, `progress`, `error`, `end`.
- Additive changes never bump the protocol version; unknown members, kinds and control types are ignored by clients.
- HTML shells mark server-rendered roots with `data-server-rendered="true"`; clients mark hydration with `data-bridge-hydrated="true"`.
