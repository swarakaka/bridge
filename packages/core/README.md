# @swarakaka/bridge-core

Framework-agnostic client runtime for the Bridge protocol. Vue and React adapters are thin bindings over this package; it has no view-layer dependency.

```ts
import { createBridge, router } from '@swarakaka/bridge-core'

const bridge = createBridge() // reads #bridge-page and <meta name="bridge-build">
bridge.init()

await router.visit('/customers/1') // Accept: application/vnd.bridge+json; v=1
await router.reload({ only: ['customers'] }) // partial reload, coalesced within 50 ms
await router.prefetch('/customers/2') // warms the page cache (Purpose: prefetch)

const form = bridge.form({ name: '' })
await form.post('/customers') // 422 → form.errors, 303 → followed, 409 → full reload
```

What it does:

- **Request manager:** builds page requests (`Accept`, `X-Bridge-Build`, `X-Bridge-Only/Except/Component`, `X-XSRF-TOKEN`), JSON bodies, multipart with `_method` spoofing, XHR upload progress.
- **Response parser:** page, error, `409` build conflict (`X-Bridge-Location`), `406`, non-Bridge responses.
- **Router:** visit lifecycle (`before`, `start`, `progress`, `success`, `invalid`, `error`, `exception`, `finish`, `navigate`), in-flight cancellation, partial merges guarded by component, deferred prop groups, history with scroll and remembered state, `prepare` hook so adapters load components before a swap.
- **Page store:** current page, keying for state preservation, `prop` control events (`replace`/`merge`/`append`/`prepend`).
- **Forms:** data, defaults, dirty tracking, first-message errors, processing/progress, `transform`, `resetOnSuccess`.
- **Page cache:** LRU with TTL and stale-while-revalidate, cleared after mutations and auth errors.

Errors: validation is delivered to the visit and never touches the page; `unauthenticated` follows its `redirect`; `csrf` reloads the document; other errors go to the store's `error` state (adapters render an error page) unless an `error` listener returns `false`.

The SSE stream client arrives in Phase 3.
