---
'@swarakaka/bridge-protocol': minor
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Watched props: a prop names the models or tags it is built from (`Bridge::watch()`, `->watch()`), models with `StreamsChanges` publish their changes as watch tags, and clients reload the matching props over their stream. Clients send `X-Bridge-Client` so a tab skips reloads its own response already delivered. Protocol: `meta.watch`, and `tags`/`client` on `invalidate` (additive within protocol 1).
