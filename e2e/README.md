# End-to-end tests

Playwright suite against the playground. `pnpm test` boots `php artisan serve` on port 8787 under `APP_ENV=e2e` (a generated `playground/.env.e2e` with debug off and its own SQLite file), reseeds the database, with `PHP_CLI_SERVER_WORKERS=12` (streams hold workers), and runs 30 specs: navigation, history, prefetch, partial reloads, deferred props, forms, validation, uploads, delete, auth, tokens, JSON demo, error pages, realtime (including a two-browser test) and raw stream-protocol checks over Node's fetch.

Prerequisites: `pnpm build` at the repo root and in `playground`, `composer install` in `playground`, `pnpm exec playwright install chromium` once. FrankenPHP and a Redis-backed run are added in Phase 4.
