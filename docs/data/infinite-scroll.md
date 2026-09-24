# Infinite scroll

An infinite-scroll list loads its next page when the user reaches its end, and its previous page when the user opened a later page directly and scrolls up.

On the server, wrap the paginated value in `Bridge::scroll()`:

```php
return Bridge::render('Customers/Index', [
    'customers' => Bridge::scroll(fn () => CustomerResource::collection(
        Customer::latest('id')->paginate(20)->withQueryString(),
    )),
]);
```

It accepts a paginator, a simple or cursor paginator, or a resource collection over one. The prop is an append [merge prop](/data/merging-props), matched on `data.id` when every item has an `id`, so a row that moved to the next page because of a new record is not shown twice. The page also describes the list's ends in `meta.scroll`, so the client never parses `links`.

On the client, wrap the list:

::: code-group

```vue [Vue]
<InfiniteScroll data="customers">
  <table>
    <tr v-for="customer in customers.data" :key="customer.id">…</tr>
  </table>
  <template #loading>Loading more…</template>
</InfiniteScroll>
```

```tsx [React]
<InfiniteScroll data="customers" loading={() => <p>Loading more…</p>}>
  <table>
    {customers.data.map((customer) => (
      <tr key={customer.id}>…</tr>
    ))}
  </table>
</InfiniteScroll>
```

:::

## How it loads

The component renders two invisible edges, before and after its content, and observes them. When the bottom edge comes within `buffer` pixels of the viewport, it visits the current address with the next page (`?page=4`), requesting only the prop and appending it. The top edge does the same with the previous page and prepends it, then scrolls by the inserted height so the rows the user is looking at stay where they are.

- **The address follows the list.** After each load the address is replaced (no new history entry) with the page just loaded, so reloading or sharing it opens the list there, and scrolling up loads the earlier pages. `preserve-url` keeps the address unchanged instead.
- **Back and forward** restore the whole loaded list from history, and loading continues from its ends.
- **One load at a time.** A short page that leaves the edge in view loads the following page right after.
- **Invalidations refresh what is loaded.** A stream `invalidate` naming the prop (or `router.invalidate()`) fetches every loaded page again, from the first, and replaces the list once with the result, so a long scrolled list stays long and new or changed rows appear in place. The address stays. Other invalidated props reload as usual.
- **Searches and filters start over.** A visit that replaces the prop (without `merge`) resets both ends from the new page.

## Options

| Prop           | Default | Meaning                                                                                                          |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `data`         | —       | The scroll prop.                                                                                                 |
| `buffer`       | `500`   | Pixels around the viewport that count as reaching an edge.                                                       |
| `manual`       | `false` | Never load automatically; show the `next`/`previous` controls instead.                                           |
| `manual-after` | —       | Load automatically this many times, then switch to the controls.                                                 |
| `reverse`      | `false` | For lists that grow upward (chat): the top edge loads the next page. Render the items in reverse order yourself. |
| `preserve-url` | `false` | Keep the address when pages load.                                                                                |
| `only`         | `[]`    | More props to reload with every page (a total count, for example).                                               |
| `as`           | `div`   | The wrapping element.                                                                                            |

Slots (Vue) and render props (React): the default content, `next` and `previous` (the manual controls; by default a "Load more" / "Load previous" button), and `loading` (receives the direction). Each receives the state (`hasNext`, `hasPrevious`, `loadingNext`, `loadingPrevious`, `manualNext`, `manualPrevious`) and `loadNext`/`loadPrevious`.

## Manual controls and accessibility

The controls appear when loading is manual: with `manual`, after `manual-after` loads, during server rendering and until the page is interactive, and in browsers without `IntersectionObserver`. The server-rendered page therefore works as a "load more" list before JavaScript runs. Keyboard users trigger automatic loads by scrolling or tabbing through the items, which moves the edge into view. After each load the component announces "Loaded page N" through an `aria-live` region.

Keep ordinary pagination links next to the list if you want direct access to a page: following one replaces the list with that page.

## Custom markup

The refresh uses `router.handleInvalidation(prop, handler)`, which other components can use to take over invalidation of a prop they manage.

`useInfiniteScroll('customers', options)` returns the same state, `loadNext`/`loadPrevious`, and two refs, `before` and `after`, to attach to your own edge elements. Core exposes the controller as `InfiniteScroll` for other view layers.

## Other modes

JSON mode serializes the paginator as usual and leaves `meta.scroll` out: API clients follow `links` or the page parameter themselves. The wire format is `packages/protocol/spec/page.md` §12.
