---
'@swarakaka/bridge-protocol': patch
---

Combining hints (Laravel): `merge()`, `prepend()`, `deep()`, `matchOn()`, `once()` and `fresh()` chain onto `Bridge::defer()` and `Bridge::lazy()`, e.g. `Bridge::defer(fn () => ...)->once(ttl: 300)` or `Bridge::defer(fn () => ...)->merge()->matchOn('data.id')`. A deferred-once prop the tab already holds is neither sent nor deferred, so no deferred request is made; a lazy-once prop the tab holds is filled in on full visits. `always()` takes no modifier and a prop cannot be both merge and once. The protocol documents the combinations (spec/page.md §4.1) with a new fixture.
