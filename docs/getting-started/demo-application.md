# Demo application

The repository ships a playground: a Laravel 13 application with a Vue 3 front end that exercises every Bridge feature and doubles as the end-to-end test target.

```bash
git clone https://github.com/swarakaka/Bridge
cd Bridge
pnpm install && pnpm build

cd playground
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate --seed && php artisan storage:link
pnpm build
pnpm serve            # http://127.0.0.1:8000
```

Sign in with `ada@example.com` / `password`.

| Page      | Demonstrates                                                                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard | Shared props, [deferred props](/data/deferred-props) in two groups                                                                                                                                                                                                           |
| Customers | CRUD, [partial reloads](/data/partial-reloads) from the search box, [prefetching](/data/prefetching) on hover, [load more](/data/merging-props), [file uploads](/basics/file-uploads), live [validation](/basics/validation), a locked record that answers 403 in every mode |
| Realtime  | One [stream](/realtime/streams) per user: notifications, prop pushes, invalidation, server-side end, reconnection, a producer stream                                                                                                                                         |
| JSON demo | The same URL requested with four `Accept` values, with bearer tokens                                                                                                                                                                                                         |
| Tokens    | Sanctum tokens for the JSON demo and curl                                                                                                                                                                                                                                    |
| Errors    | 401, 403, 404, 419 and 500 in every mode                                                                                                                                                                                                                                     |

`playground/CHECKLIST.md` lists a manual check for each feature with the expected result, and `e2e/` contains the Playwright specs that automate them.

::: tip Use the serve script
`pnpm serve` runs PHP's built-in server with several workers so open streams do not block other requests, and refuses to start when the port is taken by a stale server. A plain `php artisan serve` handles one request at a time.
:::
