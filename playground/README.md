# Playground

A full Laravel + Vue application that exercises every Bridge mode. It is the manual verification environment (`CHECKLIST.md`, Phase 2) and the target of the Playwright suite in `../e2e`.

Phase 1 built the Laravel side (Customers CRUD verified with curl). Phase 2 added the Vue UI: Dashboard with deferred props, Customers CRUD with search (partial reloads), pagination, uploads, login, Sanctum tokens, a JSON demo client and in-place error pages. Phase 3 added the Realtime page (one shared SSE stream per user, notifications, prop pushes, invalidation, server-side end, producer stream, tickets) with `CustomerChanged` events published on every create, update and delete.

```bash
pnpm build                      # at the repo root: builds packages/{protocol,core,vue}
cd playground
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate --seed && php artisan storage:link
pnpm build                      # or `pnpm dev` for Vite HMR
pnpm serve                      # http://127.0.0.1:8000 with workers — ada@example.com / password (see serve.sh; plain `php artisan serve` serves one request at a time)
```
