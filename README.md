<p align="center">
  <img src="docs/public/logo.svg" alt="Bridge" width="360">
</p>

# Bridge

**A server-driven application protocol for Laravel.** One controller action serves a Vue or React page, a JSON API response, and a real-time event stream from the same route, guards, and business logic.

```php
public function index()
{
    return Bridge::render('Customers/Index', [
        'customers' => CustomerResource::collection(Customer::paginate(20)),
    ]);
}
```

| Client sends                                    | Bridge returns                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `Accept: application/vnd.bridge+json; v=1`      | `{ "type": "page", "component": "Customers/Index", "props": { ... } }`          |
| `Accept: application/json`                      | `{ "data": { "customers": { "data": [...], "links": {...}, "meta": {...} } } }` |
| `Accept: text/event-stream` (on a stream route) | `event: bridge` / `data: {"type":"invalidate","keys":["customers"]}`            |
| `Accept: text/html`                             | The application shell with the initial page embedded                            |

Bridge is inspired by Inertia's developer experience but is designed as `Laravel → Bridge Protocol → Client`, so the Laravel package has no Vue-specific assumptions and React, mobile, and CLI clients can consume the same backend.

> **Status: 1.0.1, the first public release.** All packages share one version: `swarakaka/bridge-laravel` on Packagist and `@swarakaka/bridge-protocol`, `-core`, `-vue` and `-react` on npm (the React adapter is experimental). Release steps are in [`CONTRIBUTING.md`](CONTRIBUTING.md#releasing-maintainers). [`development/PLAN.md`](development/PLAN.md) holds the design, the phase breakdown and every deviation made since.

## Packages

| Package                      | Path                | Purpose                                                                                                              |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `swarakaka/bridge-laravel`   | `packages/laravel`  | Content negotiation, page/JSON/HTML representations, SSE streams, event bus                                          |
| `@swarakaka/bridge-protocol` | `packages/protocol` | Normative spec, JSON Schemas, golden fixtures, TypeScript types                                                      |
| `@swarakaka/bridge-core`     | `packages/core`     | Framework-agnostic client runtime (router, page store, forms, SSE client)                                            |
| `@swarakaka/bridge-vue`      | `packages/vue`      | Vue 3 bindings (`createBridgeApp`, `usePage`, `useForm`, `useStream`, `BridgeLink`) and the SSR renderer (`/server`) |
| `@swarakaka/bridge-react`    | `packages/react`    | Experimental React adapter skeleton                                                                                  |
| playground                   | `playground`        | Laravel + Vue app exercising every mode; integration test environment                                                |
| e2e                          | `e2e`               | Playwright suite against the playground                                                                              |
| benchmarks                   | `benchmarks`        | Reproducible benchmarks (fetch-based load generator; results in `benchmarks/RESULTS.md`)                             |

## Development

Requirements: PHP 8.4+, Laravel 13, Composer 2, Node 22.13+, pnpm 9+ (the repo pins pnpm 11, which needs Node 22.13 or newer).

```bash
pnpm install
pnpm build          # builds protocol → core → vue and react
pnpm test           # Vitest across packages
pnpm lint           # ESLint + Prettier

cd packages/laravel
composer install    # the Laravel package's own dependencies
vendor/bin/pest     # Pest (or `composer test` from the repo root once these are installed)
```

To run the playground locally, follow the setup in [`docs/getting-started/demo-application.md`](docs/getting-started/demo-application.md), then start it with `pnpm serve` (or `./serve.sh` from `playground/`). The script runs PHP's built-in server with several workers so open streams do not block other requests, refuses a busy port, and stops all workers on Ctrl+C; `PORT` and `WORKERS` override the defaults.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) with scopes `laravel`, `core`, `vue`, `react`, `protocol`, `playground`, `e2e`, `benchmarks`, `docs`, `ci`, `repo`, `development`, `deps`.

## Documentation

- [Technical implementation plan](development/PLAN.md)
- [Protocol specification](packages/protocol/spec/README.md)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).
