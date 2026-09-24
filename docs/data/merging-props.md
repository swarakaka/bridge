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

How values combine by default (append):

- Arrays concatenate.
- Paginator objects concatenate `data` and take `links` and `meta` from the new response.
- Any other value is replaced.

Visits without `merge: true`, including [stream invalidations](/realtime/streams), replace the prop. Use `replace: true` on load-more visits so the back button returns to the previous page rather than to page one of the list. `router.reload()` takes the same `merge` option.

## Modes

```php
'customers' => Bridge::merge($paginated),                 // append (default)
'messages'  => Bridge::merge($olderMessages)->prepend(),  // new items first: chat history, feeds
'settings'  => Bridge::deepMerge($settings),              // objects merge key by key at every depth
```

- **Prepend** works like append, with the incoming items placed before the current ones.
- **Deep merge** merges objects at every depth. Arrays at any depth are appended; scalars, and values whose type changed, take the incoming value.

## Matching items already shown

When a list changes between two loads, the next page can repeat an item the user already sees: a customer created meanwhile pushes the last row of page 1 onto page 2. `matchOn` names the item key, and an incoming item whose key is already in the list replaces that item in place instead of being added again:

```php
'customers' => Bridge::merge(fn () => CustomerResource::collection($query->paginate(20)))
    ->matchOn('data.id'),
```

A match path is the path to the list inside the prop followed by the item key:

| Prop value                      | Path                 |
| ------------------------------- | -------------------- |
| a list of items                 | `id`                 |
| a paginator or resource page    | `data.id`            |
| a nested list (with deep merge) | `thread.messages.id` |

Several paths may be given (`->matchOn('data.id', 'pinned.id')`). Items without the key are always added. Matching also lets a reload refresh items already shown: reload a page with `merge: true` and its rows update in place.

## Choosing a direction per visit

`merge: true` uses each prop's own mode. `merge: 'append'` or `merge: 'prepend'` applies one direction to every merge prop in the response, for a list that loads in both directions (older items above, newer below):

```ts
router.get(
  '/messages',
  { before: firstId },
  { only: ['messages'], merge: 'prepend', preserveScroll: true },
)
```

## Deferred and lazy merge props

`->merge()`, `->prepend()`, `->deep()` and `->matchOn()` also chain onto deferred and lazy props, for a list loaded after render and extended later: `Bridge::defer(fn () => $posts->paginate(20))->merge()->matchOn('data.id')`. See [Combining hints](/data/deferred-props#combining-hints).

## On the wire

The page lists merge props in `meta.merge` (append), `meta.prepend` and `meta.deepMerge`, and match paths in `meta.matchOn`. JSON mode leaves these out; API clients get the plain value. See `packages/protocol/spec/page.md` §3.
