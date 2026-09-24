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
| `benchmarks/RESULTS.md` populated by the harness; docs cite it                                                                         | Done (built-in server runs; no Inertia baseline yet)                                                                                                    |
| Docs cover every section of PLAN §32; protocol spec normative and versioned `1`                                                        | Done (VitePress)                                                                                                                                        |
| `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`; `bridge:install` walkthrough tested in CI                                            | Docs present; the CI playground job installs from scratch                                                                                               |

## Coverage

Measured on 2026-09-24 (line coverage): `vitest run --coverage` for the npm packages, `pest --coverage` with pcov (Homebrew PHP 8.4) for the Laravel package, Redis tests skipped:

| Package                    |                                           Lines | Target |
| -------------------------- | ----------------------------------------------: | -----: |
| `@swarakaka/bridge-core`   |                                          92.7 % |   90 % |
| `@swarakaka/bridge-vue`    |                                          91.0 % |   80 % |
| `swarakaka/bridge-laravel` | 90.5 % (CI enforces `pest --coverage --min=90`) |   90 % |

## Not in 1.0

- FrankenPHP and PHP-FPM runs in CI (the deployment guide documents them).
- The Inertia baseline benchmark app.
- The external relay (design in `development/relay-design.md`).
- `@swarakaka/bridge-react` is an experimental skeleton, not part of the 1.0 API surface.

## Cutting 1.0

- npm: done. `@swarakaka/bridge-protocol`, `-core` and `-vue` 1.0.0 and `@swarakaka/bridge-react` 0.2.0 are tagged. Pending changesets (`.changeset/*.md`) describe the next release. Releases are tag-driven: `pnpm changeset version`, commit, then push a `vX.Y.Z` tag; `release.yml` re-runs CI and E2E on the tagged commit and publishes (CONTRIBUTING.md, "Releasing").

npm trusted publishing: each package's trusted publisher must name `swarakaka` / `bridge` (lowercase, as GitHub reports the repository) / `release.yml`, with "Allow npm publish" ticked. `release.yml` requests an OIDC token (`id-token: write`); pnpm exchanges it for a publish token and falls back to `NPM_TOKEN` when the exchange fails ("Skipped OIDC" in the log). Once every package publishes through OIDC, the `NPM_TOKEN` secret can be removed; tokens that bypass 2FA lose direct publishing in January 2027.

- Laravel package: not published yet. `CHANGELOG.md` has the `1.0.0` section and an `[Unreleased]` section for the hardening since. Packagist reads a repository's root `composer.json`, and this repository's root is the private monorepo manifest, so publishing needs a read-only split of `packages/laravel`.

The split repository `swarakaka/bridge-laravel` exists (empty). `.github/workflows/split-laravel.yml` mirrors `packages/laravel` into it with `git subtree split`: every push to `main` updates its `main`, and a monorepo tag `laravel-vX.Y.Z` becomes the tag `vX.Y.Z` there. `packages/laravel` carries its own `LICENSE` and a `.gitattributes` that keeps tests and tool configs out of Composer downloads.

Remaining, by the maintainer:

1. Create a fine-grained personal access token for `swarakaka/bridge-laravel` only, with Contents: read and write, and save it as the Actions secret `SPLIT_TOKEN` in `swarakaka/bridge`.
2. Push `main`; the split workflow fills the split repository.
3. Decide the first Packagist version (fold `[Unreleased]` into `1.0.0`, or tag `1.0.0` on the 2026-09-22 commit and `1.1.0` on the current one), then `git tag laravel-vX.Y.Z && git push origin laravel-vX.Y.Z`.
4. Submit `https://github.com/swarakaka/bridge-laravel` on packagist.org and connect GitHub in the Packagist profile so it updates on every push and tag.
5. Verify with `composer require swarakaka/bridge-laravel` in a fresh Laravel 13 application.
