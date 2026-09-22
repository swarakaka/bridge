---
'@swarakaka/bridge-protocol': minor
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
---

Phase 2: framework-agnostic client runtime (`@swarakaka/bridge-core`: request manager, response parser, router with history/scroll/prefetch, page store, forms with uploads, page cache) and the Vue 3 adapter (`createBridgeApp`, `usePage`, `useProp`, `useDeferred`, `useForm`, `useRemember`, `BridgeLink`, `Deferred`, `BridgeHead`). Generated protocol types now strip schema conditionals and deduplicate cross-schema references. Phase 3 adds the SSE `StreamClient` (fetch and EventSource transports, backoff, Last-Event-ID, heartbeat watchdog, control dispatch) and `useStream`.
