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

The cache is cleared after non-GET visits, after `401`, `403` and `409` responses, and on build conflicts, so a mutation is never followed by a stale page.

Only GET visits are prefetched, and prefetches carry the normal `Accept` and credentials, so authorization applies as for any request.
