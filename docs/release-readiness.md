# Release readiness (Definition of Done, PLAN §38)

Status as of 2026-09-22.

| Criterion                                                                                                                              | Status                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All three modes plus the HTML shell served from the playground's Customers controller with no mode-specific code                       | Done                                                                                                                                                    |
| Every negotiation rule and header has a test                                                                                           | Done (`ContentNegotiatorTest`, `AcceptHeaderTest`, feature tests)                                                                                       |
| Conformance suite passes on PHP and TypeScript against shared fixtures                                                                 | Done                                                                                                                                                    |
| Every exception kind tested in every mode                                                                                              | Done (`ErrorsTest`, `ErrorMapperTest`)                                                                                                                  |
| SSE: real-HTTP integration tests with `database` and `redis`; two-browser Playwright test; `max_duration` and `Last-Event-ID` verified | Done for `database` (E2E) and `redis` (package test against a Redis service); Playwright runs under `php artisan serve` and FrankenPHP is not yet in CI |
| Coverage ≥ 90 % in `packages/laravel` and `packages/core`, ≥ 80 % in `packages/vue`                                                    | See the coverage section below                                                                                                                          |
| PHPStan level 8, strict TypeScript, zero lint errors                                                                                   | Done                                                                                                                                                    |
| `benchmarks/RESULTS.md` populated by the harness; docs cite it                                                                         | Done (built-in server runs; no Inertia baseline yet)                                                                                                    |
| Docs cover every section of PLAN §32; protocol spec normative and versioned `1`                                                        | Done (VitePress)                                                                                                                                        |
| `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`; `bridge:install` walkthrough tested in CI                                            | Docs present; the CI playground job installs from scratch                                                                                               |

## Coverage

Measured on 2026-09-22 with `vitest run --coverage` (line coverage):

| Package                    |                                                                                                             Lines | Target |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------: | -----: |
| `@swarakaka/bridge-core`   |                                                                                                            91.7 % |   90 % |
| `@swarakaka/bridge-vue`    |                                                                                                            89.9 % |   80 % |
| `swarakaka/bridge-laravel` | enforced in CI with pcov (`pest --coverage --min=90`); not measurable on the development machine (no pcov/Xdebug) |   90 % |

## Not in 1.0

- FrankenPHP and PHP-FPM runs in CI (the deployment guide documents them).
- The Inertia baseline benchmark app.
- The external relay (design in `docs/relay-design.md`).
- `@swarakaka/bridge-react` is an experimental skeleton, not part of the 1.0 API surface.

## Cutting 1.0

Done in the working tree: `pnpm changeset version` bumped `@swarakaka/bridge-protocol`, `@swarakaka/bridge-core` and `@swarakaka/bridge-vue` to 1.0.0 (`@swarakaka/bridge-react` to 0.2.0) and wrote their changelogs; `CHANGELOG.md` has the `1.0.0` section for the Laravel package.

Remaining, by the maintainer:

1. Commit: `git add -A && git commit -m "chore(repo): release 1.0.0"`.
2. Tag the Laravel package: `git tag laravel-v1.0.0 && git push --tags`.
3. Push `main`; the release workflow publishes the npm packages from the versioned manifests (requires `NPM_TOKEN`).
