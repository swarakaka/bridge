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

`useDeferred('stats')` exposes `loading` and `value` for custom handling. Deferred requests are aborted when the user navigates away before they finish. For widgets far down the page, [load when visible](/data/load-when-visible) fetches only what the user scrolls to.

## Combining hints

`merge` and `once` chain onto deferred and lazy props:

```php
return Bridge::render('Dashboard', [
    // Loaded after the first render, then reused by the tab for five minutes.
    'signups' => Bridge::defer(fn () => Signups::daily(), 'charts')->once(ttl: 300),
    // Loaded after render; later "load more" visits append to it.
    'feed' => Bridge::defer(fn () => Post::latest()->paginate(20))->merge()->matchOn('data.id'),
    // Loaded when scrolled to (<WhenVisible>), and kept for the tab.
    'activity' => Bridge::lazy(fn () => $customer->activity()->get())->once(),
]);
```

| Combination        | What the client sees                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defer()->once()`  | The first visit defers it as usual and keeps the value. Later visits in the tab neither send nor defer it: the client fills it in, and no deferred request is made. |
| `lazy()->once()`   | Absent until something names it (a reload, `<WhenVisible>`). Once the tab holds it, full visits fill it in, so `<WhenVisible>` finds it present and loads nothing.  |
| `defer()->merge()` | Arrives with the deferred request; later partial reloads with `merge: true` combine with it in its mode (`->prepend()`, `->deep()`, `->matchOn()`).                 |
| `lazy()->merge()`  | Combined in its mode whenever a merging reload names it.                                                                                                            |

`Bridge::merge()` and `Bridge::once()` are the same modifiers on a plain prop. Two combinations are refused with an exception when you write them: `always()` takes no modifier (it is sent every time), and a prop cannot be both `merge` and `once` (a held value is never sent, so there is nothing to merge into). `->fresh()` requires `once()`. Modifiers return a copy, so a shared hint is never changed by one request.

## Other modes

JSON mode resolves deferred props inline by default (`bridge.json.resolve_deferred`), because an API client cannot follow up. Partial reloads that name a deferred prop resolve it like a normal prop.

## When the fetch fails

If the follow-up request does not return a Bridge page (for example because debug output was printed before the JSON), the client logs a console warning naming the props and the response it received, and leaves the fallback showing.
