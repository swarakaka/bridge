# Playground

A full Laravel + Vue application that exercises every Bridge mode. It is the manual verification environment (`CHECKLIST.md`, Phase 2) and the target of the Playwright suite in `../e2e`.

Phase 1 built the Laravel side (Customers CRUD verified with curl). Phase 2 added the Vue UI: Dashboard with deferred props, Customers CRUD with search (partial reloads), pagination, uploads, login, Sanctum tokens, a JSON demo client and in-place error pages. The Realtime page and stream integration tests arrive in Phase 3.

```bash
pnpm build                      # at the repo root: builds packages/{protocol,core,vue}
cd playground
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate --seed && php artisan storage:link
pnpm build                      # or `pnpm dev` for Vite HMR
php artisan serve               # http://localhost:8000 — ada@example.com / password
```
