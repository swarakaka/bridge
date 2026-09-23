# Deferred props

A deferred prop is left out of the first response and fetched right after the page renders, so slow queries do not delay the page.

```php
return Bridge::render('Dashboard', [
    'recentCustomers' => CustomerResource::collection(Customer::latest('id')->limit(5)->get()),
    'stats'   => Bridge::defer(fn () => Stats::compute()),           // group "default"
    'signups' => Bridge::defer(fn () => Signups::daily(), 'charts'),  // another group
]);
```

The page object lists the pending keys per group in `deferred`. The client issues one partial reload per group, in parallel, as soon as the page is mounted. Group props that share a heavy dependency so one query serves several props.

## Rendering while loading

::: code-group

```vue [Vue]
<Deferred data="stats">
  <template #fallback><Skeleton /></template>
  {{ stats.total }} customers
</Deferred>
```

```tsx [React]
<Deferred data="stats" fallback={<Skeleton />}>
  <span>{stats?.total} customers</span>
</Deferred>
```

:::

`useDeferred('stats')` exposes `loading` and `value` for custom handling. Deferred requests are aborted when the user navigates away before they finish.

## Other modes

JSON mode resolves deferred props inline by default (`bridge.json.resolve_deferred`), because an API client cannot follow up. Partial reloads that name a deferred prop resolve it like a normal prop.

## When the fetch fails

If the follow-up request does not return a Bridge page (for example because debug output was printed before the JSON), the client logs a console warning naming the props and the response it received, and leaves the fallback showing.
