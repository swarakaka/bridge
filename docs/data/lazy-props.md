# Lazy props

A lazy prop is never included unless a partial reload names it. Use it for data that only some interactions need: a filter dropdown's options, an export preview, a large secondary list.

```php
return Bridge::render('Customers/Index', [
    'customers' => CustomerResource::collection($query->paginate(20)),
    'filtersUi' => Bridge::lazy(fn () => Filter::all()),
]);
```

```ts
router.reload({ only: ['filtersUi'] })
```

Unlike a [deferred prop](/data/deferred-props), nothing is fetched automatically; to fetch it when part of the page scrolls into view, use [`<WhenVisible>`](/data/load-when-visible). JSON clients opt in with `X-Bridge-Only: filtersUi`.

| Hint     | Full page load                                                         | Partial reload naming it         | JSON mode                 |
| -------- | ---------------------------------------------------------------------- | -------------------------------- | ------------------------- |
| plain    | included                                                               | included when selected           | included                  |
| `lazy`   | excluded                                                               | included                         | excluded unless requested |
| `defer`  | excluded, listed in `deferred`                                         | included                         | resolved inline           |
| `always` | included                                                               | always included                  | included                  |
| `merge`  | included, listed in `meta.merge` (or `meta.prepend`, `meta.deepMerge`) | combined when the visit opted in | included                  |
| `once`   | included unless the client holds it ([once props](/data/once-props))   | included                         | included                  |
