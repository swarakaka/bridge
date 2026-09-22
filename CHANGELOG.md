# Changelog

All notable changes to the Laravel package (`swarakaka/bridge-laravel`) are documented here. npm packages use changesets; their changelogs live in each package directory.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.0] - 2026-09-22

First release. One Laravel controller action serves an HTML shell, a Bridge page object, a JSON API document and server-sent event streams from the same route, guards and business logic. Companion npm packages at 1.0.0: `@swarakaka/bridge-protocol`, `@swarakaka/bridge-core`, `@swarakaka/bridge-vue`. `@swarakaka/bridge-react` 0.2.0 is an experimental skeleton outside the 1.0 API surface. Not included in 1.0: FrankenPHP runs in CI, the Inertia baseline benchmark, the external stream relay (design only).

### Added

- Phase 5 (SSR and 1.0 readiness): `SsrGateway` with `HttpSsrGateway`/`NullSsrGateway`, `bridge.ssr.*` config, `@bridge`/`@bridgeHead` emit server-rendered markup and head fragments, `bridge:ssr` command, release-readiness checklist (`docs/release-readiness.md`), relay design (`docs/relay-design.md`), mobile SDK guide.
- Phase 4 (hardening): `Bridge::merge()` props with `meta.merge` and opt-in appending on partial reloads, `->jsonRoot()` for JSON mode, Laravel Precognition support (`form.validate()`), the `throttle:bridge-stream` rate limiter, caps on client-requested channels, a real-Redis bus test (CI runs it against a Redis service), the security review (`docs/security-review.md`), the benchmark harness with recorded results (`benchmarks/RESULTS.md`), the VitePress documentation site (`pnpm docs:dev`), and accessibility fixes in the playground (skip link, landmarks, `aria-current`, live regions).
- Phase 3 (streams): `Bridge::stream()` with channel subscriptions and one-off producers, `Bridge::to()->invalidate/prop/notify/navigate/progress/event/end`, `ShouldStream` events, `Bridge::channel()` authorization, `EventBus` contract with `sync`, `database` (polling, prunable) and `redis` (Redis Streams) drivers, heartbeats, bounded `max_duration` with orderly `end`, `Last-Event-ID` replay that ignores historical end signals, per-user connection limits, signed stream tickets (`Bridge::streamTicket()`, `bridge.ticket` middleware ordered before `auth`), `bridge:doctor` and `bridge:stream:prune`, JSON errors for streams before establishment.
- Phase 2 (playground, Laravel side): Sanctum tokens on the same `web` routes (`auth:sanctum`), `CustomerPolicy` with locked customers (403 in every mode), login/logout, token management, JSON demo and error-trigger routes, `auth` shared prop. Client packages are versioned with changesets.
- Phase 1 (Laravel core): `Accept`-based content negotiation (`ContentNegotiator`, `Mode`, `AcceptHeader`), `HandleBridgeRequests` middleware (negotiation, `409` build conflicts, `303` redirect conversion, `Vary`, weak `ETag`/`304`), `Bridge::render()` with HTML/page/JSON representers, prop resolution (`lazy`, `defer`, `always`, shared props, partial selection with dot keys, Laravel-native serialization of resources and paginators), `Bridge::redirect()` (302/303/JSON result document), central `ErrorMapper`/`ExceptionRenderer`, `Bridge\Http\Middleware\VerifyCsrfToken`, default HTML shell with `@bridge`/`@bridgeHead`, `bridge:install`, testing macros, and a conformance suite against the protocol fixtures.
- Playground: Laravel side with Customers CRUD and Dashboard served in all three non-stream modes, feature tests, and the Milestone 1 curl checklist.
- Phase 0: monorepo scaffold, tooling, CI skeleton, protocol specification drafts (v1), JSON Schemas and golden fixtures.
