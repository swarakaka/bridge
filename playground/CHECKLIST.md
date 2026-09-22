# Playground verification checklist

Manual checks for every Bridge mode. Phase 1 covers the Laravel side; Phase 2 adds the Vue UI rows, Phase 3 the realtime rows.

## Setup

```bash
cd playground
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate --seed
php artisan serve
```

## Phase 1 — one controller, three representations (curl)

| Check                               | Command                                                                                                                                                                        | Expect                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| HTML shell with embedded page       | `curl -s -H 'Accept: text/html' localhost:8000/customers \| grep -c bridge-page`                                                                                               | `1`                                               |
| Page object                         | `curl -s -H 'Accept: application/vnd.bridge+json; v=1' localhost:8000/customers \| jq .component`                                                                              | `"Customers/Index"`                               |
| Deferred props listed, not resolved | `... \| jq .deferred`                                                                                                                                                          | `{"default":["stats"]}`                           |
| JSON envelope                       | `curl -s -H 'Accept: application/json' localhost:8000/customers \| jq .data.customers.meta.total`                                                                              | `57`                                              |
| Deferred inline in JSON             | `... \| jq .data.stats`                                                                                                                                                        | object                                            |
| Partial reload                      | `curl -s -H 'Accept: application/vnd.bridge+json; v=1' -H 'X-Bridge-Only: customers' -H 'X-Bridge-Component: Customers/Index' localhost:8000/customers \| jq '.props \| keys'` | `["customers"]` plus always props                 |
| Validation, JSON                    | `curl -s -H 'Accept: application/json' -X POST -d 'name=' localhost:8000/customers`                                                                                            | 422 `{message, errors}`                           |
| Validation, page                    | `curl -s -H 'Accept: application/vnd.bridge+json; v=1' -X POST -d 'name=' localhost:8000/customers`                                                                            | 422 `{type:"error",...}`                          |
| Create, JSON                        | `curl -s -H 'Accept: application/json' -X POST -d 'name=Initech&email=it@initech.test' -i localhost:8000/customers`                                                            | 201 + `Location` + `{data, meta.location}`        |
| Build conflict                      | `curl -s -i -H 'Accept: application/vnd.bridge+json; v=1' -H 'X-Bridge-Build: stale' localhost:8000/customers \| grep -E '409\|X-Bridge-Location'`                             | 409 + header (only when a build id is configured) |
| Stream accept on render route       | `curl -s -i -H 'Accept: text/event-stream' localhost:8000/customers \| head -1`                                                                                                | 406                                               |
| 404                                 | `curl -s -H 'Accept: application/json' localhost:8000/customers/999999`                                                                                                        | `{"message":"Not Found."}`                        |
| ETag / 304                          | `curl -s -i -H 'Accept: application/json' localhost:8000/customers \| grep ETag`, then repeat with `-H 'If-None-Match: <etag>'`                                                | 304                                               |

Note: curl POSTs above hit CSRF because the routes are in the `web` group. Use `-H 'Authorization: Bearer x'` with the Bridge CSRF middleware variant (Phase 2 wires Sanctum), or disable CSRF locally while testing.

## Phase 2 — Vue UI (browser)

`pnpm build` at the repo root, then `pnpm build` here, `php artisan serve`, open http://localhost:8000. Sign in as `ada@example.com` / `password`. Each row is also a Playwright spec in `../e2e/tests`.

| Check                      | Where                                                                   | Expect                                                                       |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Navigation without reloads | Nav links                                                               | URL changes, no document reload, thin progress bar while loading             |
| Back/forward               | Browser buttons                                                         | Pages restore instantly from history state                                   |
| Prefetch                   | Hover a customer name                                                   | A request with `Purpose: prefetch`; click is instant                         |
| Partial reload             | Customers search box                                                    | Request with `X-Bridge-Only: customers,filters`; input keeps focus and value |
| Deferred props             | Dashboard                                                               | Skeletons, then stats and chart fill in                                      |
| Validation                 | New customer, submit empty                                              | Field errors under inputs, URL unchanged                                     |
| Create + flash             | New customer                                                            | 303 followed, show page, toast "Customer created."                           |
| Upload                     | Edit customer, choose an image                                          | Progress bar, avatar on the show page                                        |
| Delete                     | Show page                                                               | Confirm dialog, back to list, toast                                          |
| Auth                       | Visit /customers signed out                                             | Login page, then back to /customers                                          |
| Tokens                     | /tokens                                                                 | Create token, use it on the JSON demo with `Authorization: Bearer`           |
| JSON demo                  | /json                                                                   | Same URL answers JSON, page, HTML, and 406 for `text/event-stream`           |
| Errors                     | /errors                                                                 | 403/404/500 rendered in place; 401 navigates to login; 419 reloads           |
| Build conflict             | Change `BRIDGE_BUILD_VERSION` in `.env` while the tab is open, navigate | Full document reload                                                         |

## Phase 3 — Realtime (pending)

Connection status, live events, notifications, prop updates, invalidation, reconnect, heartbeat.
