# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state of the repository

**Phases 0 to 5 are complete** (2026-09-22). Phase 0: pnpm monorepo, tooling, CI, protocol package (spec, schemas, fixtures, generated TS types). Phase 1: the Laravel package serves HTML, page and JSON from one controller with negotiation, props, errors, redirects, caching, CSRF variant, testing helpers and a conformance suite. Phase 2: `@swarakaka/bridge-core` (request manager, router, history, page store, forms, cache), `@swarakaka/bridge-vue` (`createBridgeApp`, composables, `BridgeLink`, `Deferred`, `BridgeHead`), the playground's Vue UI (Dashboard, Customers CRUD with uploads, JSON demo, login, Sanctum tokens, error pages). Phase 3: SSE end to end: event bus (`sync`, `database`, `redis`), `Bridge::stream()`/`Bridge::to()`, `ShouldStream`, tickets, `bridge:doctor`; the core `StreamClient` (fetch and EventSource transports, backoff, `Last-Event-ID`, watchdog, control dispatch); `useStream`; the playground Realtime page with one shared stream per user; Playwright specs including a two-browser realtime test and raw-protocol checks over Node fetch. Phase 4: merge props ("load more"), `jsonRoot`, Precognition live validation, the `throttle:bridge-stream` limiter and channel caps, a real-Redis bus test, the security review, the benchmark harness with recorded results, the VitePress docs site, and playground accessibility. Phase 5: SSR gateway and `@swarakaka/bridge-vue/server` renderer with hydration (E2E runs the whole suite under SSR), the experimental `@swarakaka/bridge-react` skeleton, the mobile SDK guide, the relay design and `development/release-readiness.md`. The npm packages are released at 1.0.0 (react 0.2.0); the Laravel package awaits a split repository for Packagist (`development/release-readiness.md`). A hardening pass (2026-09-24) followed; its changes are in the PLAN deviations section ("Hardening").

One document in `development/` governs all work (the `docs/` directory is the user-facing VitePress site only):

- `development/PLAN.md` is the technical implementation plan and the source of truth for requirements. It answers the original design brief's 20 open questions (Appendix A), fixes the protocol, and defines Phases 0–5. Its final section records deviations made during implementation. Implementation must follow the plan; if a decision must change, update the plan first, in the same change. The brief itself (`development/propmts.md`) was removed on 2026-09-23 and lives only in git history.

`packages/protocol/spec/*.md` is the **normative** protocol text; `packages/protocol/schemas` and `packages/protocol/fixtures` are its machine-readable form. Any protocol change starts there, then `pnpm generate`, then implementation on both sides. The PHP conformance suite (`packages/laravel/tests/Conformance`) asserts the server produces the fixtures exactly, so fixture edits and server changes go together.

## Commands

Requirements: Node 22.13+ (pnpm 11 needs `node:sqlite`), pnpm 9+ (repo pins pnpm 11), PHP 8.4+, Laravel 13, Composer 2.

```bash
pnpm install                 # workspace deps
pnpm generate                # regenerate packages/protocol/src/generated from schemas (commit the output)
pnpm build                   # tsc for protocol → core → vue and react
pnpm typecheck               # tsc --noEmit per package
pnpm test                    # Vitest per package (protocol has the TS conformance suite)
pnpm lint                    # eslint + prettier --check   (pnpm lint:fix to write)
pnpm docs:dev                # VitePress site from docs/ (docs:build to verify)
cd playground && pnpm build && php artisan bridge:ssr   # SSR server for local use (BRIDGE_SSR_ENABLED=true in .env)
pnpm --filter bridge-benchmarks bench   # benchmarks; appends to benchmarks/RESULTS.md (needs the root and playground builds; writes playground/.env.e2e if missing; Redis optional via BRIDGE_STREAM_DRIVER=redis)

cd packages/laravel
composer install
vendor/bin/pest              # unit + feature + conformance (BRIDGE_TEST_REDIS=1 with a local Redis runs the Redis bus tests)
vendor/bin/pint --test       # style (preset laravel, strict types)
vendor/bin/phpstan analyse   # level 8

cd playground
composer install && cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate --seed && php artisan storage:link
php artisan test             # feature tests across modes
pnpm typecheck && pnpm build # vue-tsc + vite (needs `pnpm build` at the root first: the playground consumes packages/*/dist)
pnpm serve                   # ./serve.sh: built-in server from public/ with workers; then open http://127.0.0.1:8000 (ada@example.com / password) or run the curl checks in playground/CHECKLIST.md

cd e2e
pnpm exec playwright install chromium   # once
pnpm test                    # Playwright; boots `php artisan serve --no-reload` on :8787 with PHP_CLI_SERVER_WORKERS=12 and the explicit env in playwright.config.ts (e2eEnv), fresh seeded database/e2e.sqlite
```

Client packages consume each other's `dist`, so after changing `packages/core` or `packages/vue` run `pnpm build` before testing the playground or E2E.

Conventions enforced by tooling: Conventional Commits with scopes `laravel|core|vue|react|protocol|playground|e2e|benchmarks|docs|ci|repo|development|deps` (commitlint), Prettier (no semicolons, single quotes, width 100; `development/PLAN.md` and `composer.json` files are excluded), ESLint with `consistent-type-imports`, Pint `laravel` preset with `declare_strict_types`, PHPStan level 8 (no baseline, no ignores).

Git: the maintainer commits and pushes; do not commit unless asked.

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

## Streams (Phase 3) notes

- `packages/laravel/src/Stream/StreamResponse.php` is the loop: ready → replay (if `Last-Event-ID`) → blocking bus reads → heartbeats → `end{max_duration}`. Tests drive it with the `sync` bus, `->maxDuration(0)` (drain once) and `Last-Event-ID: 0` (replay everything).
- `ignore_user_abort(true)` is deliberate: the loop checks `connection_aborted()` itself so `finally` (limiter release) always runs. A replayed `end` signal is ignored (`isHistorical`).
- The ticket middleware must run before `auth:*`; the provider inserts it with `Kernel::addToMiddlewarePriorityBefore(AuthenticatesRequests::class, …)`.
- `php artisan serve` serves one request at a time unless `PHP_CLI_SERVER_WORKERS` is set **and** `--no-reload` is used; in no-reload mode the parent's whole environment is forwarded to workers, so E2E passes its env explicitly. Killing only the parent leaves workers bound to the port with a dead stdout pipe; Laravel's router script then prints a `file_put_contents(): Broken pipe` notice into every response and corrupts Bridge JSON. Use `playground/serve.sh` (refuses busy ports, one process group) and `lsof -ti :8000 | xargs kill -9` to clear orphans.
- Client: `StreamClient` reconnects immediately after an orderly `end` (no resync), uses backoff otherwise, and refuses a tight loop after short-lived connections (throttled streams).

## Post-1.0 notes

- `<x-bridge::app />` / `<x-bridge::head />` (`Bridge\View\Components`) read the current response's shell data from the `bridge.shell` request attribute set by `HtmlRepresenter`; the directives keep reading view variables. Both must stay byte-identical (`BladeComponentsTest` checks). Named multiple roots were considered and deferred: two routers cannot both own history.
- `useJson` (Vue) wraps core `JsonRequest` over `JsonClient` (`bridge.json`): JSON mode from components without a visit. Deliberately not named `useHttp`; kinds come from the HTTP status because JSON errors are Laravel-native. `useJson` never reloads or redirects on `419`/`401`.

## Phase 5 notes

- Package ESM output uses explicit `.js` import specifiers with `moduleResolution: NodeNext`, so Node can load `dist/` (the SSR bundle imports `@swarakaka/bridge-vue/server`). Keep `.js` on relative imports in `packages/*/src`; the protocol generator emits them.
- Blade directive changes are not picked up by compiled views: run `php artisan view:clear` (and clear Testbench's `vendor/orchestra/testbench-core/laravel/storage/framework/views` when package tests behave as if a directive did not change).
- `v-html` on a Vue component is dropped by SSR; use it on a native element inside the slot. Pages must not touch `window`/timers during setup; `useStream` skips connecting on the server.
- E2E runs with SSR on: `playwright.config.ts` starts `node bootstrap/ssr/ssr.js` on :13715 and the `page.goto` wrapper waits for `#app[data-bridge-hydrated]`.
- Playground `pnpm build` builds the client and the SSR bundle (`bootstrap/ssr`, gitignored).

## Hardening notes (2026-09-24)

- Never use `migrate:fresh` on a SQLite file in WAL mode that other processes may have used: Laravel truncates the file and a leftover `-wal` corrupts it. E2E setup and the benchmark harness delete the file with its `-wal`/`-shm` and run `migrate`.
- The Redis bus sends raw commands (no connection key prefix). Tests that inspect or delete its keys must use `executeRaw`, not `Redis::connection()->del()`/`keys()`.
- A queued `router.reload()` waits for an in-flight visit instead of cancelling it; `form.validate()` uses `router.request()`, outside the visit pipeline. Keep background requests out of `performVisit`.
- New regression tests should fail on the old code; for Vue component-update bugs pass slots as `{ default, $stable: true }` or Vue re-renders the child anyway and hides the bug.

## Phase 4 notes

- Merge props are opt-in per visit (`merge: true`); invalidations and searches replace. Server lists keys in `meta.merge`.
- `form.validate(method, url, field)` uses Laravel Precognition; routes need the `precognitive` middleware. A 204 is parsed as `empty` and reported as success without touching the page.
- The benchmark harness starts PHP's built-in server directly from `playground/public` (not `artisan serve`: its output pipe stalls streams when stdio is ignored), as a detached process group it kills on exit, and refuses to start if the port is busy. Idle keep-alive sockets pin dev-server workers, so load requests send `Connection: close`. SQLite runs in WAL mode for the database bus (`DB_JOURNAL_MODE`, `DB_BUSY_TIMEOUT` in the playground config).
- A stream subscription is live only after `ready`; tests and load generators must wait for it before publishing.

## What Bridge is

Bridge is a planned open-source **server-driven application bridge for Laravel** with first-party Vue 3 and React clients (React is experimental), intended to live at `github.com/swarakaka/Bridge`. It is inspired by Inertia's developer experience but must not copy Inertia's internals.

One Laravel controller returning `Bridge::render('Customers/Index', [...])` must be consumable in three modes from the same route and business logic:

| Mode       | Request                                              | Response                                  |
| ---------- | ---------------------------------------------------- | ----------------------------------------- |
| Page / SPA | `Accept: application/vnd.bridge+json` (+ `X-Bridge`) | `{ type: "page", component, url, props }` |
| JSON / API | `Accept: application/json`                           | `{ data: ... }` (exact envelope TBD)      |
| SSE        | `Accept: text/event-stream`                          | `event: bridge` stream (event model TBD)  |

A plain `Accept: text/html` request returns the minimal app shell.

## Non-negotiable architectural rules (from the original brief, now in PLAN.md)

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

The original brief proposed a pnpm monorepo. Treat it as a starting point, not a decision (PLAN §28 has the final layout):

```
packages/laravel/    Laravel package (negotiator, responses, SSE stream, event bus)
packages/vue/        Vue 3 adapter (createBridgeApp, router, page store, forms, SSE client)
packages/protocol/   Shared protocol definitions / types
playground/          Laravel + Vue app demonstrating all three modes; doubles as the integration-test environment
tests/  docs/  benchmarks/  .github/workflows/
```

The playground must exercise Dashboard, Customers CRUD, a JSON demo, and a `Realtime` SSE page (connection status, live events, prop updates, invalidation, reconnect, heartbeat).

## Workflow expectations

- If asked to "plan", produce or update the plan; do not scaffold files. Implementation starts only on an explicit instruction such as "Implement Phase 1".
- The original brief listed 20 open architectural questions (embedded initial props, JSON resources, SSE prop-update vs invalidate, PHP-FPM viability, protocol versioning, etc.). PLAN.md Appendix A answers them; any change must keep those answers explicit rather than leave them implicit.
- Testing must cover all three modes on both sides, including real SSE integration tests, and Playwright for E2E.
