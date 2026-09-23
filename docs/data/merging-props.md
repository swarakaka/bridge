# Merging props

Merge props support "load more" lists: the next page's items are appended to the ones already shown instead of replacing them.

```php
return Bridge::render('Customers/Index', [
    'customers' => Bridge::merge(fn () => CustomerResource::collection($query->paginate(20))),
]);
```

The server lists the key in `meta.merge`. Appending is opt-in per visit, so the same page can search (replace) and paginate (append) without changing the controller:

::: code-group

```ts [Vue]
router.get(
  '/customers',
  { page: next },
  {
    only: ['customers'],
    merge: true,
    preserveState: true,
    preserveScroll: true,
    replace: true,
  },
)
```

```ts [React]
router.get(
  '/customers',
  { page: next },
  {
    only: ['customers'],
    merge: true,
    preserveState: true,
    preserveScroll: true,
    replace: true,
  },
)
```

:::

How values combine:

- Arrays concatenate.
- Paginator objects concatenate `data` and take `links` and `meta` from the new response.
- Any other value is replaced.

Visits without `merge: true`, including [stream invalidations](/realtime/streams), replace the prop. Use `replace: true` on load-more visits so the back button returns to the previous page rather than to page one of the list.
