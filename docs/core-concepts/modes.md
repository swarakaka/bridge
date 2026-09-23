# Modes and negotiation

A request's `Accept` header selects one of four modes. Nothing else does, and controllers never inspect it.

| Mode     | Media type                         | Used by                                               |
| -------- | ---------------------------------- | ----------------------------------------------------- |
| `html`   | `text/html`                        | Browser navigations: the shell with the embedded page |
| `page`   | `application/vnd.bridge+json; v=1` | The Bridge client during navigation                   |
| `json`   | `application/json`                 | Mobile apps, scripts, integrations                    |
| `stream` | `text/event-stream`                | Real-time subscriptions on stream routes              |

Rules that matter day to day:

- Quality values are honoured; ties are broken in the order stream, page, JSON, HTML. `Accept: */*` selects HTML by default, configurable per route with `->defaults('bridge.default_mode', 'json')`.
- The `v` parameter is the protocol version. An unsupported version gets a `406` and the client performs a full document load.
- A rendering route asked for `text/event-stream` answers `406`; a stream route asked for anything else answers `406`. Misconfiguration is visible rather than silently degraded.
- Page and JSON responses carry `Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component`.

Read the negotiated mode when you must (rarely): `request()->bridgeMode()` or `Bridge::mode()`.

The full algorithm is in the [protocol reference](/reference/protocol).
