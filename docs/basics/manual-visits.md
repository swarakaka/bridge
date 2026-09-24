# Manual visits

The router is available anywhere:

::: code-group

```ts [Vue]
import { router } from '@swarakaka/bridge-vue'
```

```ts [React]
import { router } from '@swarakaka/bridge-react'
```

:::

```ts
await router.visit('/customers?page=2')
await router.get(
  '/customers',
  { search: 'acme' },
  { only: ['customers'], preserveState: true, replace: true },
)
await router.post('/customers', { name: 'Acme' })
await router.put('/customers/1', data)
await router.patch('/customers/1', data)
await router.delete('/customers/1')
await router.reload({ only: ['stats'] })
router.back()
```

Every method returns a promise of the outcome: `success`, `invalid` (validation errors), `error`, `exception`, `cancelled` or `redirected` (a full document load is underway).

## Options

| Option                                                                                                          | Meaning                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`, `data`, `headers`                                                                                     | Request shape. GET data becomes query parameters.                                                                                                                       |
| `replace`                                                                                                       | Replace the current history entry.                                                                                                                                      |
| `preserveState`                                                                                                 | Keep the page component instance (and its local state) when the component is the same.                                                                                  |
| `preserveScroll`                                                                                                | Do not reset scroll after the swap.                                                                                                                                     |
| `only`, `except`                                                                                                | Partial reload selection.                                                                                                                                               |
| `merge`                                                                                                         | Append [merge props](/data/merging-props) instead of replacing them.                                                                                                    |
| `useCache`                                                                                                      | Allow a fresh or stale [prefetched](/data/prefetching) page to be used (default true for GET).                                                                          |
| `preserveUrl`                                                                                                   | Show the new page under the current address: the address bar, history entry and `page.url` keep the URL the user is on (a "load more" that should not change `?page=`). |
| `showProgress`                                                                                                  | `false` marks a background visit; the visit's `showProgress` flag tells [progress indicators](/advanced/progress-indicators) to skip it (default `true`).               |
| `queryStringArrayFormat`                                                                                        | Arrays in GET data: `indices` (default, `tags[0]=a&tags[1]=b`) or `brackets` (`tags[]=a&tags[]=b`). Laravel reads both.                                                 |
| `invalidateCacheTags`                                                                                           | [Cache tags](/data/prefetching#cache-tags) to flush when the visit succeeds.                                                                                            |
| `optimistic`                                                                                                    | `(props) => patch`: top-level props to show until the server answers, undone on failure. See [Optimistic updates](/advanced/optimistic-updates).                        |
| `onBefore`, `onStart`, `onProgress`, `onSuccess`, `onInvalid`, `onError`, `onException`, `onCancel`, `onFinish` | Per-visit callbacks; `onBefore` may return `false` to cancel.                                                                                                           |

## Concurrency

A new visit cancels the visit in flight. Reload calls made within 50 ms are coalesced into one request, which matters when several stream invalidations arrive together.
