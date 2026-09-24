---
'@swarakaka/bridge-protocol': minor
'@swarakaka/bridge-core': minor
---

Once props: `Bridge::once(fn, key:, ttl:)` sends a prop to a client once; the client keeps it in memory for the tab, announces the keys it holds in the new `X-Bridge-Once` header, and fills the omitted values back in before the page renders. A key can be shared between props and pages, `->fresh()` or a reload naming the prop sends a new value, and stored values are dropped on `401`/`403`/`419`, on a history clear and on `router.clearCache()`. JSON mode resolves once props inline. The protocol adds `meta.once` (spec/page.md §11), the `X-Bridge-Once` header and `PAGE_VARY`; page responses now vary on `X-Bridge-Once`.
