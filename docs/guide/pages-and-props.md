# Pages and props

```php
return Bridge::render('Dashboard', [
    'recentCustomers' => CustomerResource::collection(Customer::latest('id')->limit(5)->get()),
    'stats'   => Bridge::defer(fn () => Stats::compute()),          // loaded after first render, group "default"
    'signups' => Bridge::defer(fn () => Signups::daily(), 'charts'), // another group, loaded in parallel
    'filters' => Bridge::lazy(fn () => Filter::all()),               // only when a partial reload names it
    'auth'    => Bridge::always(fn () => ['user' => auth()->user()]), // present in every response
    'items'   => Bridge::merge(fn () => Item::paginate()),           // appended on "load more" partial reloads
]);
```

| Hint            | Full page load                        | Partial reload naming the key    | JSON mode                 |
| --------------- | ------------------------------------- | -------------------------------- | ------------------------- |
| plain / closure | included                              | included when selected           | included                  |
| `lazy`          | excluded                              | included                         | excluded unless requested |
| `defer`         | excluded, listed in `deferred[group]` | included                         | resolved inline           |
| `always`        | included                              | always included                  | included                  |
| `merge`         | included, listed in `meta.merge`      | appended when the visit opted in | included                  |

Closures are container-injected, so they may type-hint the `Request` or services.

## Shared props

```php
Bridge::share('auth', fn (Request $request) => ['user' => $request->user()]);
```

`errors` (session validation errors after a classic HTML form post) and `flash` (from the configured session keys) are shared by default.

## Deferred props in Vue

```vue
<Deferred data="stats">
  <template #fallback><Skeleton /></template>
  {{ stats.total }} customers
</Deferred>
```

`useDeferred('stats')` exposes `loading` and `value`. Deferred requests are aborted when the user navigates away.

## Reading props

Props arrive as Vue props. `usePage()` gives the whole page, `useProp('customers.meta.total')` a reactive ref to one (dot keys allowed), updated by navigation, partial reloads and stream events.
