# Changelog

All notable changes to the Laravel package (`swarakaka/bridge-laravel`) are documented here. npm packages use changesets; their changelogs live in each package directory.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Phase 2 (playground, Laravel side): Sanctum tokens on the same `web` routes (`auth:sanctum`), `CustomerPolicy` with locked customers (403 in every mode), login/logout, token management, JSON demo and error-trigger routes, `auth` shared prop. Client packages are versioned with changesets.
- Phase 1 (Laravel core): `Accept`-based content negotiation (`ContentNegotiator`, `Mode`, `AcceptHeader`), `HandleBridgeRequests` middleware (negotiation, `409` build conflicts, `303` redirect conversion, `Vary`, weak `ETag`/`304`), `Bridge::render()` with HTML/page/JSON representers, prop resolution (`lazy`, `defer`, `always`, shared props, partial selection with dot keys, Laravel-native serialization of resources and paginators), `Bridge::redirect()` (302/303/JSON result document), central `ErrorMapper`/`ExceptionRenderer`, `Bridge\Http\Middleware\VerifyCsrfToken`, default HTML shell with `@bridge`/`@bridgeHead`, `bridge:install`, testing macros, and a conformance suite against the protocol fixtures.
- Playground: Laravel side with Customers CRUD and Dashboard served in all three non-stream modes, feature tests, and the Milestone 1 curl checklist.
- Phase 0: monorepo scaffold, tooling, CI skeleton, protocol specification drafts (v1), JSON Schemas and golden fixtures.
