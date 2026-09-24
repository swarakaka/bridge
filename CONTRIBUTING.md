# Contributing to Bridge

Thanks for helping. Please read `development/PLAN.md` first; it is the architectural source of truth. Changes that alter a decision recorded there must update the plan in the same PR.

## Setup

```bash
git clone https://github.com/swarakaka/Bridge
cd Bridge
pnpm install
composer install
```

## Layout

- `packages/protocol` — the spec. Every protocol change starts here: update the Markdown spec, the JSON Schema, and the golden fixtures, then implement on both sides.
- `packages/laravel` — PHP. Tests with Pest, style with Pint, analysis with PHPStan level 8.
- `packages/core`, `packages/vue` — TypeScript. Tests with Vitest, `tsc --noEmit` for types, ESLint + Prettier.
- `playground` — the demo app and integration environment.
- `e2e` — Playwright.

## Workflow

1. Branch from `main`.
2. Use Conventional Commits: `feat(laravel): add ETag to page responses`. Scopes: `laravel`, `core`, `vue`, `react`, `protocol`, `playground`, `e2e`, `benchmarks`, `docs`, `ci`, `repo`, `development`, `deps`.
3. Add a changeset (`pnpm changeset`) when an npm package changes.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `composer test` before pushing.
5. Open a PR. CI must be green and one review is required.

## Releasing (maintainers)

npm packages are released by tag only; merging to `main` publishes nothing.

1. On an up-to-date `main`, apply the pending changesets: `pnpm changeset version`. This bumps the versions of all four npm packages together and deletes the consumed `.changeset/*.md` files. The `CHANGELOG.md` files stay empty.
2. Commit: `git commit -am "chore(repo): version packages"` and push `main`.
3. Tag that commit with the new version, which all four npm packages share (a changesets `fixed` group; the workflow compares with `packages/core/package.json`), and push the tag: `git tag v1.0.2 && git push origin v1.0.2`.
4. `release.yml` checks that the tag is on `main`, matches the versions and leaves no changeset unapplied, runs the full CI and E2E suites on the tagged commit, then publishes every package whose version is not on npm yet (npm trusted publishing, with provenance) and pushes the per-package tags (`@swarakaka/bridge-core@1.1.0`, …).

The Laravel package is released by tag too, with the same version number: `git tag laravel-v1.0.2 && git push origin laravel-v1.0.2`. `split-laravel.yml` mirrors `packages/laravel` into the read-only `swarakaka/bridge-laravel` (on every push to `main`) and turns the tag into `v1.0.2` there, which Packagist picks up.

## Rules of the road

- No mode-specific branching in controllers, ever. If you need it, the negotiator or a representer is missing something.
- No Vue imports in `packages/laravel` or `packages/core`.
- No performance claims without a benchmark in `benchmarks/` and an entry in `benchmarks/RESULTS.md`.
- Every custom header must be documented in `packages/protocol/spec/headers.md`.
- Every protocol fixture must validate against its schema on both the PHP and TypeScript side.

## Code of conduct

See `CODE_OF_CONDUCT.md`.
