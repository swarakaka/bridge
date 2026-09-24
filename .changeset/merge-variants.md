---
'@swarakaka/bridge-protocol': minor
'@swarakaka/bridge-core': minor
---

Merge variants: `Bridge::merge(...)->prepend()` places incoming items first, `Bridge::deepMerge(...)` merges objects at every depth, and `->matchOn('data.id')` replaces an item already shown instead of adding it twice (the last path segment is the item key). The page lists keys in `meta.merge`, `meta.prepend` and `meta.deepMerge` with match paths in `meta.matchOn` (spec/page.md §3); older clients still append `meta.merge` keys and replace the others. `merge: 'append' | 'prepend'` on a visit overrides every key's mode, `router.reload()` accepts `merge`, and core exports `combineProp` and `readMergeModes`.
