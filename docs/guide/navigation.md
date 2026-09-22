# Navigation

```vue
<BridgeLink href="/customers/1" prefetch="hover">Acme</BridgeLink>
<BridgeLink href="/logout" method="post" as="button">Sign out</BridgeLink>
```

```ts
import { router } from '@swarakaka/bridge-vue'

await router.visit('/customers?page=2', { preserveScroll: true })
await router.get(
  '/customers',
  { search: 'acme' },
  { only: ['customers'], preserveState: true, replace: true },
)
await router.reload({ only: ['stats'] }) // coalesced within 50 ms
await router.prefetch('/customers/2')
router.back()
```

## Partial reloads

`only` and `except` send `X-Bridge-Only` / `X-Bridge-Except` with `X-Bridge-Component`. The server returns just those props (plus `always` props) and the client merges them into the current page when the component matches; otherwise it swaps the page.

## Load more

Mark a prop with `Bridge::merge()` on the server and opt in per visit:

```ts
router.get(
  '/customers',
  { page: next },
  { only: ['customers'], merge: true, preserveState: true, preserveScroll: true, replace: true },
)
```

Arrays concatenate; paginator objects concatenate `data` and take `links`/`meta` from the response. Visits that do not opt in (searches, invalidations) replace the prop.

## History and scroll

Every page swap stores the page, scroll positions and remembered state in `history.state`, so back and forward restore instantly without a request. `preserveScroll` keeps the window and `[bridge-scroll-region]` elements in place; `useRemember('key', value)` persists component state across history entries.

## Prefetch and cache

Prefetched pages sit in an in-memory cache (30 s fresh, 30 s stale-while-revalidate) keyed by URL and partial selection. The cache is cleared after mutations and after 401/403/409 responses.

## Build versions

The client sends `X-Bridge-Build`; when the server's build differs on a GET, it answers `409` with `X-Bridge-Location` and the client performs a full document load. Non-GET requests are never rejected for a stale build.
