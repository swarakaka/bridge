# Partial reloads

A partial reload asks the server for a subset of the current page's props and merges them into the page in place. Use it for searches, filters, pagination and anything that should not remount the page.

::: code-group

```ts [Vue]
router.get('/customers', { search }, { only: ['customers'], preserveState: true, replace: true })
router.reload({ only: ['stats'] })
router.reload({ except: ['activity'] })
```

```ts [React]
router.get('/customers', { search }, { only: ['customers'], preserveState: true, replace: true })
router.reload({ only: ['stats'] })
```

:::

```vue
<BridgeLink
  href="/customers?page=2"
  :only="['customers']"
  preserve-state
  preserve-scroll
>Next</BridgeLink>
```

## What travels

The client sends `X-Bridge-Only: customers` (or `X-Bridge-Except`) together with `X-Bridge-Component: Customers/Index`. The server resolves only the named props, plus any [always props](/data/always-props), and returns a page object with just those. Closures for unselected props never run, so partial reloads are cheap on the server too.

Dot keys select nested values: `only: ['customers.data']`.

## Component mismatch

If the URL now renders a different component (a redirect to another page, a role change) the server ignores the selection and returns the full page. The client swaps components as on a normal visit, so a partial reload can never leave a page half-populated with another page's data.

## Coalescing

Reload calls made within 50 ms are merged into one request with the union of keys. Stream invalidations rely on this: five `invalidate` events arriving together become one round trip. [Polling](/data/polling) ticks join the same request.

Pass `showProgress: false` to mark a reload as background work (`visit.showProgress`); a merged request shows progress if any of its callers wanted it.
