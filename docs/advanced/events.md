# Events

The router emits events for every stage of a visit. Use them for progress indicators, analytics, confirmation dialogs and global error handling.

```ts
import { getBridge } from '@swarakaka/bridge-vue' // or '@swarakaka/bridge-react'

const off = getBridge().on('start', (visit) => console.log('visiting', visit.url))
off() // unsubscribe
```

| Event       | Payload                    | When                                                                                                        |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `before`    | `visit`                    | Before the request. Return `false` to cancel the visit.                                                     |
| `start`     | `visit`                    | The request has been sent.                                                                                  |
| `progress`  | `{ visit, progress }`      | Upload progress on multipart requests.                                                                      |
| `success`   | `{ visit, page }`          | A page was received and applied.                                                                            |
| `invalid`   | `{ visit, errors, error }` | A `422` was received.                                                                                       |
| `error`     | `{ visit, error }`         | A non-validation error. Return `false` to prevent the default rendering.                                    |
| `exception` | `{ kind, visit, error }`   | Network failure or unparsable response. Call `preventDefault()` to suppress the default.                    |
| `cancel`    | `visit`                    | The visit was cancelled by a newer one or by `onBefore`.                                                    |
| `finish`    | `visit`                    | After success, error or cancel.                                                                             |
| `navigate`  | `{ page, visit }`          | The page changed: a visit, a history pop, or a stream `navigate`. `visit` is `null` for history navigation. |

## Per-visit callbacks

The same hooks exist per visit and on forms: `onBefore`, `onStart`, `onProgress`, `onSuccess`, `onInvalid`, `onError`, `onException`, `onCancel`, `onFinish`. Per-visit callbacks run before the global listeners.

```ts
router.delete(`/customers/${id}`, {
  onBefore: () => confirm('Delete this customer?'),
  onSuccess: () => toast('Deleted'),
})
```

## Examples

```ts
// Confirm leaving a dirty form
getBridge().on('before', (visit) => {
  if (form.isDirty && visit.method === 'get') return confirm('Discard changes?')
})

// Page-view analytics
getBridge().on('navigate', ({ page }) => analytics.page(page.url))
```

## Stream events

Streams have their own listeners (`on('notification', …)`, `on('state', …)`, application events). See [The stream client](/realtime/client).
