---
'@swarakaka/bridge-protocol': minor
'@swarakaka/bridge-core': minor
---

History encryption: pages whose `meta.encryptHistory` is set are stored in browser history sealed with AES-GCM (key in `sessionStorage`), with only scroll positions in clear, and restored on back/forward after decryption. A page with `meta.clearHistory` replaces the key in this tab and, through a `localStorage` counter, in the origin's other tabs, so earlier entries are requested from the server again; prefetched pages are dropped too. Without Web Crypto the page is kept out of history instead of stored in clear. The protocol types `meta.merge`, `meta.encryptHistory` and `meta.clearHistory` (spec/page.md §10). Laravel: `bridge.history.encrypt`, the `bridge.encrypt-history` middleware, `Bridge::encryptHistory()`, `->encryptHistory()` on responses, and `Bridge::clearHistory()`, called on Laravel's `Logout` event by default (`bridge.history.clear_on_logout`).
