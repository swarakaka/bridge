# Release readiness (Definition of Done, PLAN §38)

Status as of 2026-09-24.

| Criterion                                                                                                                              | Status                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All three modes plus the HTML shell served from the playground's Customers controller with no mode-specific code                       | Done                                                                                                                                                    |
| Every negotiation rule and header has a test                                                                                           | Done (`ContentNegotiatorTest`, `AcceptHeaderTest`, feature tests)                                                                                       |
| Conformance suite passes on PHP and TypeScript against shared fixtures                                                                 | Done                                                                                                                                                    |
| Every exception kind tested in every mode                                                                                              | Done (`ErrorsTest`, `ErrorMapperTest`)                                                                                                                  |
| SSE: real-HTTP integration tests with `database` and `redis`; two-browser Playwright test; `max_duration` and `Last-Event-ID` verified | Done for `database` (E2E) and `redis` (package test against a Redis service); Playwright runs under `php artisan serve` and FrankenPHP is not yet in CI |
| Coverage ≥ 90 % in `packages/laravel` and `packages/core`, ≥ 80 % in `packages/vue`                                                    | See the coverage section below                                                                                                                          |
| PHPStan level 8, strict TypeScript, zero lint errors                                                                                   | Done                                                                                                                                                    |
| `benchmarks/RESULTS.md` populated by the harness; docs cite it                                                                         | Done (built-in server runs; no reference baseline yet)                                                                                                  |
| Docs cover every section of PLAN §32; protocol spec normative and versioned `1`                                                        | Done (VitePress)                                                                                                                                        |
| `SECURITY.md`, `CONTRIBUTING.md`; `bridge:install` walkthrough tested in CI (`CHANGELOG.md` kept empty, PLAN deviations §31)           | Docs present; the CI playground job installs from scratch                                                                                               |

## Coverage

Measured on 2026-09-24 (line coverage): `vitest run --coverage` for the npm packages, `pest --coverage` with pcov (Homebrew PHP 8.4) for the Laravel package, Redis tests skipped:

| Package                    |                                           Lines | Target |
| -------------------------- | ----------------------------------------------: | -----: |
| `@swarakaka/bridge-core`   |                                          92.7 % |   90 % |
| `@swarakaka/bridge-vue`    |                                          91.0 % |   80 % |
| `swarakaka/bridge-laravel` | 90.5 % (CI enforces `pest --coverage --min=90`) |   90 % |

## Not in 1.0

- FrankenPHP and PHP-FPM runs in CI (the deployment guide documents them).
- The reference baseline benchmark app.
- The external relay (design in `development/relay-design.md`).
- `@swarakaka/bridge-react` is an experimental skeleton, not part of the 1.0 API surface.

## First release: 1.0.1

All packages are versioned 1.0.1: `@swarakaka/bridge-protocol`, `-core`, `-vue` and `-react` on npm (one changesets `fixed` group) and `swarakaka/bridge-laravel` on Packagist. npm does not allow 1.0.0 again because a 1.0.0 was published there on 2026-09-23 and is being withdrawn. The `CHANGELOG.md` files are kept empty.

npm trusted publishing: each package's trusted publisher must name `swarakaka` / `bridge` (lowercase, as GitHub reports the repository) / `release.yml`, with "Allow npm publish" ticked. `release.yml` requests an OIDC token (`id-token: write`); pnpm exchanges it for a publish token and falls back to `NPM_TOKEN` when the exchange fails ("Skipped OIDC" in the log). Once every package publishes through OIDC, the `NPM_TOKEN` secret can be removed; tokens that bypass 2FA lose direct publishing in January 2027.

The Laravel package reaches Packagist through the read-only split repository `swarakaka/bridge-laravel`: `.github/workflows/split-laravel.yml` mirrors `packages/laravel` on every push to `main` and turns a monorepo tag `laravel-vX.Y.Z` into `vX.Y.Z` there. `packages/laravel` carries its own `LICENSE` and a `.gitattributes` that keeps tests and tool configs out of Composer downloads.

Remaining, by the maintainer:

1. Commit and push `main`.
2. `git tag v1.0.1 && git push origin v1.0.1`: `release.yml` verifies the tag, runs CI and E2E, and publishes the four npm packages.
3. `git tag laravel-v1.0.1 && git push origin laravel-v1.0.1`: the split repository gets `v1.0.1`.
4. Submit `https://github.com/swarakaka/bridge-laravel` on packagist.org and connect GitHub in the Packagist profile.
5. Withdraw the old npm versions once 1.0.1 is out: `npm unpublish` `@swarakaka/bridge-react@0.2.0`, `-vue@1.0.0`, `-core@1.0.0`, `-protocol@1.0.0` in that order (possible until 72 hours after 2026-09-23); `npm deprecate` any that npm refuses.
6. Verify with `composer require swarakaka/bridge-laravel` and `npm i @swarakaka/bridge-vue` in fresh applications.
