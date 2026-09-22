# Contributing to Bridge

Thanks for helping. Please read `docs/PLAN.md` first; it is the architectural source of truth. Changes that alter a decision recorded there must update the plan in the same PR.

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
2. Use Conventional Commits: `feat(laravel): add ETag to page responses`. Scopes: `laravel`, `core`, `vue`, `protocol`, `playground`, `e2e`, `benchmarks`, `docs`, `ci`, `repo`.
3. Add a changeset (`pnpm changeset`) when an npm package changes. Add a `CHANGELOG.md` entry under "Unreleased" when the Laravel package changes.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `composer test` before pushing.
5. Open a PR. CI must be green and one review is required.

## Rules of the road

- No mode-specific branching in controllers, ever. If you need it, the negotiator or a representer is missing something.
- No Vue imports in `packages/laravel` or `packages/core`.
- No performance claims without a benchmark in `benchmarks/` and an entry in `benchmarks/RESULTS.md`.
- Every custom header must be documented in `packages/protocol/spec/headers.md`.
- Every protocol fixture must validate against its schema on both the PHP and TypeScript side.

## Code of conduct

See `CODE_OF_CONDUCT.md`.
