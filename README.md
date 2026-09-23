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

> **Status: pre-alpha.** Phases 0–2 are in place: protocol spec and fixtures, the Laravel package (HTML, page and JSON modes), the client runtime and Vue adapter, and a playground with Playwright coverage. Phase 3 added streams (SSE) end to end; Phase 4 added merge props, Precognition, rate limiting, the security review, benchmarks and the docs site. Phase 5 added server-side rendering with hydration, the React adapter skeleton, the mobile SDK guide, the relay design and the release-readiness checklist. See `development/release-readiness.md` for what 1.0 includes. See [`development/PLAN.md`](development/PLAN.md) for the plan and phase breakdown.

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
| benchmarks                   | `benchmarks`        | Reproducible benchmarks (k6, Lighthouse CI, phpbench)                                                                |

## Development

Requirements: PHP 8.4+, Laravel 13, Composer 2, Node 20+, pnpm 9+.

```bash
pnpm install
pnpm build          # builds protocol → core → vue
pnpm test           # Vitest across packages
pnpm lint           # ESLint + Prettier
composer install    # Laravel package (from Phase 1)
composer test       # Pest
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) with scopes `laravel`, `core`, `vue`, `protocol`, `playground`, `e2e`, `benchmarks`, `docs`, `ci`, `repo`.

## Documentation

- [Technical implementation plan](development/PLAN.md)
- [Protocol specification](packages/protocol/spec/README.md)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).

# bridge
