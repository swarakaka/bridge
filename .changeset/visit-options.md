---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

New visit options, also accepted by form submissions and `BridgeLink`: `preserveUrl` (show the new page under the current address), `showProgress` (`false` sets `visit.showProgress` so progress indicators can skip background visits), `queryStringArrayFormat` (`'indices'`, the default, or `'brackets'` for `a[]=x`) and `invalidateCacheTags`. Prefetched pages can be tagged with `cacheTags` (`router.prefetch` and `BridgeLink`) and flushed with `router.flushByCacheTags(tags)`. `mergeQuery` accepts the array format as a third argument.
