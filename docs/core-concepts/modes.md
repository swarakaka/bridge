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
- Page and JSON responses carry `Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component`; page responses add `X-Bridge-Once`.

Read the negotiated mode when you must (rarely): `request()->bridgeMode()` or `Bridge::mode()`.

## `wantsJson()` and `expectsJson()` in page mode

A page visit is a browser navigation, so Laravel code downstream of Bridge's middleware sees it as one: during a page visit `HandleBridgeRequests` replaces `Accept` with `text/html, application/xhtml+xml` and `$request->wantsJson()` and `$request->expectsJson()` return `false`. Laravel and its packages branch on these methods to choose between an API answer and a redirect: Fortify's login, logout, two-factor and password responses, `verified` (`EnsureEmailIsVerified`), `password.confirm` (`RequirePassword`). In page mode they redirect, and Bridge turns the redirect into a `303` the client follows. JSON-mode requests (`Accept: application/json`) keep their JSON branch, and stream requests are untouched.

Bridge itself reads the negotiation stored on the request, never the header. If your code needs the client's header, it is in `$request->attributes->get(Negotiation::ORIGINAL_ACCEPT_ATTRIBUTE)` (`Bridge\Negotiation\Negotiation`). The header is restored after the response is built, so request loggers and terminable middleware see the value the client sent.

Guidance for your own code and for packages you write:

- Do not use `wantsJson()` to detect Bridge. Use `request()->bridgeMode()` if you must know the mode, and prefer returning a redirect or `Bridge::render()` and letting Bridge represent it.
- Branch on `wantsJson()` only where you mean "an API client asked for JSON". That is exactly JSON mode, and it keeps working.
- Middleware that runs **before** Bridge's (global middleware, and route middleware in Laravel's priority list, such as `auth`, `throttle` and `SubstituteBindings`) still sees the original `Accept`. Code there should throw (an `AuthenticationException`, a `ThrottleRequestsException`, `abort()`) rather than build a response itself: Bridge's exception renderer represents exceptions per mode wherever they are thrown.

The full algorithm is in the [protocol reference](/reference/protocol).
