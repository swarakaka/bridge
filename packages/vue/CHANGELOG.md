# @swarakaka/bridge-vue

## 1.0.0

### Major Changes

- 7f8e198: 1.0: server-side rendering (`@swarakaka/bridge-vue/server` renderer and HTTP server, hydration, `BridgeHead` head fragments, `data-bridge-hydrated` marker), ESM output with explicit `.js` specifiers so Node consumers work, `useStream` no longer connects during SSR.

### Minor Changes

- 821a976: Phase 2: framework-agnostic client runtime (`@swarakaka/bridge-core`: request manager, response parser, router with history/scroll/prefetch, page store, forms with uploads, page cache) and the Vue 3 adapter (`createBridgeApp`, `usePage`, `useProp`, `useDeferred`, `useForm`, `useRemember`, `BridgeLink`, `Deferred`, `BridgeHead`). Generated protocol types now strip schema conditionals and deduplicate cross-schema references. Phase 3 adds the SSE `StreamClient` (fetch and EventSource transports, backoff, Last-Event-ID, heartbeat watchdog, control dispatch) and `useStream`.

### Patch Changes

- Updated dependencies [821a976]
- Updated dependencies [7f8e198]
  - @swarakaka/bridge-protocol@1.0.0
  - @swarakaka/bridge-core@1.0.0
