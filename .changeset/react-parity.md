---
'@swarakaka/bridge-react': minor
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': patch
---

React adapter parity with Vue, and shared server pieces in core.

- React: `useStream`, `useJson`, `useRemember`, `useForm({ remember })`, `BridgeHead`, and `@swarakaka/bridge-react/server` (`createSsrRenderer`, `createSsrServer`). `BridgeLink` gains `except`, `headers`, visit callbacks, `activeClass`, attribute passthrough, and leaves `target="_blank"` to the browser. `data-bridge-hydrated` is set after React commits.
- Core: `@swarakaka/bridge-core/server` exports `createSsrServer` (moved from the Vue package, which re-exports it); the main entry exports `renderHead`, `createHeadData`, `HeadManager` and `HEAD_ATTRIBUTE`, shared by both adapters' `BridgeHead`.
