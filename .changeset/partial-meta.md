---
'@swarakaka/bridge-protocol': patch
'@swarakaka/bridge-core': patch
---

Fixed: a partial response (a deferred group, a reload, a poll) no longer replaces the page's `meta` wholesale. Members that describe props (`merge`, `prepend`, `deepMerge`, `matchOn`, `once`, `scroll`) are updated only for the props the response carries, and entries for other props are kept; other members come from the response (spec/page.md §3). Core exports `mergePartialMeta`.
