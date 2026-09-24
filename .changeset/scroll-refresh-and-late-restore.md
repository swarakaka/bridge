---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Infinite scroll: an invalidation of the scroll prop (a stream `invalidate`, `router.invalidate()`) now re-fetches every loaded page and replaces the list once, instead of dropping back to one page. New `router.handleInvalidation(prop, handler)` lets a component take over invalidation of a prop; `router.request()` accepts `only`. History encryption: remembered state of an encrypted page (`useRemember`, form `remember`) now survives a full reload: it is decrypted after the page loads and applied unless the user already changed the value; the new `restore` router event carries the values.
