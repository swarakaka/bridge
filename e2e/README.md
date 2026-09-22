# End-to-end tests

Playwright suite against the playground. `pnpm test` boots `php artisan serve` on port 8787 under `APP_ENV=e2e` (a generated `playground/.env.e2e` with debug off and its own SQLite file), reseeds the database, and runs 20 specs: navigation, history, prefetch, partial reloads, deferred props, forms, validation, uploads, delete, auth, tokens, JSON demo and error pages.

Prerequisites: `pnpm build` at the repo root and in `playground`, `composer install` in `playground`, `pnpm exec playwright install chromium` once. FrankenPHP and the two-browser-context realtime spec are added in Phase 3.
