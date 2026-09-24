---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
---

JSON mode from components: core `JsonClient` (`bridge.json`) and `JsonRequest`, and the Vue `useJson` composable. They call the same routes with `Accept: application/json`, unwrap the `{ data, meta }` envelope, map error kinds from the HTTP status, and never reload or redirect on `419`/`401`.
