# Always props

An always prop is included in every response, including partial reloads that do not name it.

```php
return Bridge::render('Customers/Index', [
    'customers' => CustomerResource::collection($query->paginate(20)),
    'unread'    => Bridge::always(fn () => $request->user()->unreadNotifications()->count()),
]);
```

Use it for small values that must never go stale between partial reloads, such as counters or permission flags. Shared props are ordinary props and follow the selection; wrap one in `Bridge::always()` if it should ride along on every partial response.

Keep always props cheap: their closures run on every request to the page.
