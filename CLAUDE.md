# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state of the repository

**Phases 0, 1 and 2 are complete** (2026-09-22). Phase 0: pnpm monorepo, tooling, CI, protocol package (spec, schemas, fixtures, generated TS types). Phase 1: the Laravel package serves HTML, page and JSON from one controller with negotiation, props, errors, redirects, caching, CSRF variant, testing helpers and a conformance suite. Phase 2: `@swarakaka/bridge-core` (request manager, router, history, page store, forms, cache), `@swarakaka/bridge-vue` (`createBridgeApp`, composables, `BridgeLink`, `Deferred`, `BridgeHead`), the playground's Vue UI (Dashboard, Customers CRUD with uploads, JSON demo, login, Sanctum tokens, error pages) and a 20-spec Playwright suite. Streams/SSE are Phase 3.

Two documents govern all work:

- `docs/propmts.md` (filename typo is deliberate) is the original design brief and source of truth for requirements.
- `docs/PLAN.md` is the technical implementation plan. It answers the brief's 20 open questions, fixes the protocol, and defines Phases 0–5. Its final section records deviations made during implementation. Implementation must follow the plan; if a decision must change, update the plan first, in the same change.

`packages/protocol/spec/*.md` is the **normative** protocol text; `packages/protocol/schemas` and `packages/protocol/fixtures` are its machine-readable form. Any protocol change starts there, then `pnpm generate`, then implementation on both sides. The PHP conformance suite (`packages/laravel/tests/Conformance`) asserts the server produces the fixtures exactly, so fixture edits and server changes go together.

## Commands

Requirements: Node 20+, pnpm 9+ (repo pins pnpm 11), PHP 8.2+ (8.3+ for Laravel 13), Composer 2.

```bash
pnpm install                 # workspace deps
pnpm generate                # regenerate packages/protocol/src/generated from schemas (commit the output)
pnpm build                   # tsc for protocol → core → vue
pnpm typecheck               # tsc --noEmit per package
pnpm test                    # Vitest per package (protocol has the TS conformance suite)
pnpm lint                    # eslint + prettier --check   (pnpm lint:fix to write)

cd packages/laravel
composer install
vendor/bin/pest              # unit + feature + conformance (90 tests)
vendor/bin/pint --test       # style (preset laravel, strict types)
vendor/bin/phpstan analyse   # level 8

cd playground
composer install && cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate --seed && php artisan storage:link
php artisan test             # feature tests across modes (11)
pnpm typecheck && pnpm build # vue-tsc + vite (needs `pnpm build` at the root first: the playground consumes packages/*/dist)
php artisan serve            # then open http://localhost:8000 (sign in: ada@example.com / password) or run the curl checks in playground/CHECKLIST.md

cd e2e
pnpm exec playwright install chromium   # once
pnpm test                    # Playwright; boots `php artisan serve` on :8787 with playground/.env.e2e (generated) and a fresh seeded database/e2e.sqlite
```

Client packages consume each other's `dist`, so after changing `packages/core` or `packages/vue` run `pnpm build` before testing the playground or E2E.

Conventions enforced by tooling: Conventional Commits with scopes `laravel|core|vue|protocol|playground|e2e|benchmarks|docs|ci|repo` (commitlint), Prettier (no semicolons, single quotes, width 100; `docs/propmts.md`, `docs/PLAN.md` and `composer.json` files are excluded), ESLint with `consistent-type-imports`, Pint `laravel` preset with `declare_strict_types`, PHPStan level 8 (no baseline, no ignores).

Git: the repository is initialized but has no commits yet. Do not commit unless asked.

## Package layout notes (Laravel)

- `Bridge\Negotiation` — `Accept` parsing and mode selection. Nothing else may inspect `Accept`.
- `Bridge\Page`, `Bridge\Props` — representation: `Page` → `PropResolver` (partial selection, hints) → `Serializer` (Laravel-native shapes) → `PageDocument`.
- `Bridge\Representation` — transport: `HtmlRepresenter`, `PageRepresenter`, `JsonRepresenter` behind `RepresenterRegistry`.
- `Bridge\Errors` — `ErrorMapper` (exception → `ErrorEnvelope`) and `ExceptionRenderer` (registered with Laravel's handler; only takes over page/JSON modes).
- `Bridge\Http\Middleware\HandleBridgeRequests` is appended to the `web` group through the HTTP kernel (`callAfterResolving(Kernel)`), because the kernel re-syncs groups to the router on construction; pushing into the router directly is overwritten.
- Controllers in the playground contain no mode-specific code. Keep it that way.

## Package layout notes (client)

- `packages/core/src/router/Router.ts` is the navigation engine; `PageStore` is the state; adapters mirror the store into their reactivity system (`packages/vue/src/state.ts`). The router's `prepare` hook loads the page component before the swap so renders are synchronous.
- Page components get `page.props` as Vue props; a static `layout` option (`defineOptions({ layout })`) wraps them. Non-validation errors render the `resolveError` component in place without touching history.
- Forms expose `form.data.*` (not flattened fields) and `form.errors.*` holds the first message per field.
- E2E specs use `data-testid` attributes; keep them stable when editing playground pages.

## What Bridge is

Bridge is a planned open-source **server-driven application bridge for Laravel** with a Vue 3 first-party client, intended to live at `github.com/swarakaka/Bridge`. It is inspired by Inertia's developer experience but must not copy Inertia's internals.

One Laravel controller returning `Bridge::render('Customers/Index', [...])` must be consumable in three modes from the same route and business logic:

| Mode       | Request                                              | Response                                  |
| ---------- | ---------------------------------------------------- | ----------------------------------------- |
| Page / SPA | `Accept: application/vnd.bridge+json` (+ `X-Bridge`) | `{ type: "page", component, url, props }` |
| JSON / API | `Accept: application/json`                           | `{ data: ... }` (exact envelope TBD)      |
| SSE        | `Accept: text/event-stream`                          | `event: bridge` stream (event model TBD)  |

A plain `Accept: text/html` request returns the minimal app shell.

## Non-negotiable architectural rules (from the brief)

- **Protocol first, not Laravel → Vue.** The layering is `Laravel → Bridge Protocol → Client`. The Laravel package must contain no Vue-specific assumptions so React, mobile, and CLI clients can consume it later.
- **Centralized content negotiation.** Never put `if (request()->expectsJson())` in controllers. A single negotiator resolves HTML / Bridge Page / JSON / SSE from `Accept` (standard headers preferred; custom `X-Bridge-*` headers only where HTTP cannot express the intent, and every custom header must be documented).
- **Three-layer separation:** Domain/Application → Representation → Transport. The same data model is serialized through Page JSON, JSON API, and SSE. "What the data means" is separate from "how it is transported".
- **JSON mode is core, not a hack.** No `ApiCustomerController` duplicates. Authentication (session, Sanctum, bearer, OAuth) stays Laravel's responsibility; Bridge only decides representation.
- **SSE is a first-class mode.** Event bus must be an interface (in-memory, Redis, Reverb, etc.), never coupled to Redis. Do not put bearer tokens in query strings without strong justification. Consider a fetch-based SSE client alongside native `EventSource` because browsers cannot set custom headers on `EventSource`.
- **Errors are handled centrally** so one `ValidationException` maps to the right shape per mode. No per-controller exception handling.
- **Caching defaults differ per mode** and must be conservative with authenticated data (SSE: `Cache-Control: no-cache`).
- **Prefer Laravel-native abstractions** (e.g. `JsonResource`) over inventing new ones unless the plan explicitly justifies a Bridge resource layer.
- **No unbenchmarked performance claims.** Benchmarks must be reproducible.

## Planned repository layout

The brief proposes a pnpm monorepo. Treat it as a starting point, not a decision:

```
packages/laravel/    Laravel package (negotiator, responses, SSE stream, event bus)
packages/vue/        Vue 3 adapter (createBridgeApp, router, page store, forms, SSE client)
packages/protocol/   Shared protocol definitions / types
playground/          Laravel + Vue app demonstrating all three modes; doubles as the integration-test environment
tests/  docs/  benchmarks/  .github/workflows/
```

The playground must exercise Dashboard, Customers CRUD, a JSON demo, and a `Realtime` SSE page (connection status, live events, prop updates, invalidation, reconnect, heartbeat).

## Workflow expectations

- The brief's final deliverable is a **technical implementation plan**, not code. If asked to "plan", produce the plan; do not scaffold files. Implementation starts only on an explicit instruction such as "Implement Phase 1".
- Section 36 of the brief lists 20 open architectural questions (embedded initial props, JSON resources, SSE prop-update vs invalidate, PHP-FPM viability, protocol versioning, etc.). Any plan or implementation must answer these explicitly rather than leave them implicit.
- Testing must cover all three modes on both sides, including real SSE integration tests, and Playwright for E2E.
