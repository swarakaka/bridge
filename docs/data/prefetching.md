# Prefetching

Prefetching fetches a page before the user asks for it and serves it from a short-lived in-memory cache when they do.

## Links

`<BridgeLink>` prefetches on hover by default, after 75 ms. `prefetch="mount"` fetches as soon as the link renders; `:prefetch="false"` disables it.

::: code-group

```vue [Vue]
<BridgeLink href="/customers/1">Acme</BridgeLink>
<BridgeLink href="/dashboard" prefetch="mount">Dashboard</BridgeLink>
```

```tsx [React]
<BridgeLink href="/customers/1">Acme</BridgeLink>
<BridgeLink href="/dashboard" prefetch="mount">Dashboard</BridgeLink>
```

:::

## Programmatic

```ts
await router.prefetch('/customers/2')
await router.prefetch('/customers?page=2', { only: ['customers'] })
```

## The cache

Entries are keyed by URL and partial selection. An entry is fresh for 30 s and served stale for another 30 s while it revalidates in the background; both TTLs are configurable in `createBridgeApp({ cache })`. Pass `useCache: false` to a visit to bypass it.

The cache is cleared after non-GET visits and JSON-mode mutations, after `401`, `403` and `419` responses, and by stream invalidations; a build conflict (`409`) reloads the whole document. A mutation is therefore never followed by a stale page.

## Cache tags

Tag prefetched pages to flush them together later:

::: code-group

```vue [Vue]
<BridgeLink href="/customers" cache-tags="customers">Customers</BridgeLink>
```

```tsx [React]
<BridgeLink href="/customers" cacheTags="customers">
  Customers
</BridgeLink>
```

:::

```ts
await router.prefetch('/customers?page=2', { cacheTags: ['customers', 'lists'] })

router.flushByCacheTags('customers') // removes every entry with any of the tags
router.clearCache() // removes everything
```

A visit or form submission can flush tags when it succeeds with `invalidateCacheTags: 'customers'`. Because the whole cache is already cleared after every successful non-GET visit and JSON-mode mutation, this matters for GET visits (a filter change, an action behind a GET link) and for code that knows data changed through another channel. A page stored again by a later visit keeps the tags it was prefetched with.

Only GET visits are prefetched, and prefetches carry the normal `Accept` and credentials, so authorization applies as for any request.
