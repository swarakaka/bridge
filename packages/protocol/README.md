# @swarakaka/bridge-protocol

The contract between the Laravel package and every client adapter.

- `spec/` — normative Markdown specification (protocol version 1).
- `schemas/` — JSON Schema 2020-12 for every wire object.
- `fixtures/` — golden examples. The PHP test suite asserts it produces them; the TypeScript test suite asserts it parses them. Both validate them against the schemas.
- `src/` — TypeScript types (generated from the schemas by `pnpm generate`) plus hand-written type guards.

Change process: update the spec, update the schema, add or change fixtures, run `pnpm generate`, then implement on both sides.
