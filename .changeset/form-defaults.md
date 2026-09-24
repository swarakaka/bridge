---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

`createBridgeApp({ forms: { ... } })` (core `BridgeConfig.forms`) sets defaults for every form: `recentlySuccessfulFor` (how long `recentlySuccessful` stays true, default 2000 ms), `resetOnSuccess`, `resetOnError` and `setDefaultsOnSuccess`. A form's own options win.
