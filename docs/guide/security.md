# Security

Bridge decides representation only. Authentication, authorization, CSRF and CORS stay with Laravel and your application. The controls Bridge adds:

- **Redirects.** `X-Bridge-Location` is emitted only for app-controlled redirects. The client ignores `navigate` events and visits to other origins unless `allowExternalNavigate` is set.
- **Cache poisoning.** Private defaults, full `Vary`, and `public` refused for authenticated users unless forced.
- **CSRF.** Laravel's scheme is untouched. `Bridge\Http\Middleware\VerifyCsrfToken` skips verification only for requests that carry `Authorization: Bearer …` and no session cookie.
- **Streams.** Channels are computed server-side; client-requested channels must pass `Bridge::channel()` and are capped in number and length. `invalidate` carries no data. Every reconnection is a new authenticated request; replayed events are re-filtered and replayed `end` signals ignored. Connections are bounded by `max_duration_s`, a per-user concurrent cap and the `throttle:bridge-stream` limiter.
- **Tickets.** Signed, short-lived, bound to the user and route parameters, authenticated for one request only, ordered before `auth:*`.
- **Debug leakage.** Traces only in JSON mode with `app.debug`; never in page or stream errors.

Rules for application code:

- Publish data-carrying events (`prop`, application events) only to per-user or per-tenant channels. Use `invalidate` for anything shared.
- Schedule `bridge:stream:prune` when using the database bus.
- Treat access logs as sensitive if they capture ticket URLs, or lower `ticket_ttl_s`.

The full review with evidence per control is in the repository at `docs/security-review.md`.
