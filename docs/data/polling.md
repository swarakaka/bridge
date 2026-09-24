# Polling

Polling reloads props of the current page on a timer. Before you reach for it, consider a [stream](/realtime/streams): the server pushes an `invalidate` or `prop` event only when data changes, so nothing is sent while nothing happens. Poll for data that has no publisher (a third-party status, a queue length computed on read) or on hosts where streams are not deployed.

::: code-group

```vue [Vue]
<script setup lang="ts">
import { usePoll } from '@swarakaka/bridge-vue'

defineProps<{ queue: { waiting: number } }>()

usePoll(5000, { only: ['queue'] })
</script>
```

```tsx [React]
import { usePoll } from '@swarakaka/bridge-react'

export default function Jobs({ queue }: { queue: { waiting: number } }) {
  usePoll(5000, { only: ['queue'] })
  return <p>{queue.waiting} waiting</p>
}
```

:::

Each tick is a [partial reload](/data/partial-reloads) (`router.reload(options)`), so the server resolves only the listed props.

## Behaviour

- **No pile-up.** The next reload is scheduled `interval` ms after the previous one finished, so a slow server never receives a queue of requests.
- **Shared with other reloads.** A tick in the same 50 ms window as a stream invalidation or another reload travels in the same request, and a tick waits for a navigation the user started instead of cancelling it.
- **Background work.** Polls set `visit.showProgress` to `false`, so progress indicators built on it stay hidden. Pass `showProgress: true` in the reload options to show them.
- **Hidden tabs.** A poll pauses while the tab is hidden. When the tab becomes visible again it reloads at once if a tick was missed, then continues on schedule. `keepAlive: true` keeps polling in hidden tabs (a dashboard on a wall screen).
- **Lifetime.** `usePoll` starts after the component is mounted, so server rendering runs no timers, and stops when it unmounts. In a page component that is when the user navigates away; in a persistent layout the poll keeps running across pages, which suits shared props such as a notification count.
- **Errors** are reported through the usual [events](/advanced/events); the next tick runs on schedule. There is no backoff.

## Options

```ts
const { start, stop, active } = usePoll(interval, reloadOptions, { autoStart, keepAlive })
```

| Option          | Default | Meaning                                                                                 |
| --------------- | ------- | --------------------------------------------------------------------------------------- |
| `interval`      | —       | Milliseconds between the end of one reload and the start of the next.                   |
| `reloadOptions` | `{}`    | `only`, `except`, `headers`, `preserveScroll`, `showProgress`, `onSuccess`, `onFinish`. |
| `autoStart`     | `true`  | Start when mounted; with `false`, call `start()`.                                       |
| `keepAlive`     | `false` | Keep polling while the tab is hidden.                                                   |

`start()` and `stop()` control the poll; `active` (a ref in Vue) tells whether it runs. In Vue, `interval` and `reloadOptions` may be refs or getters; a new interval restarts the schedule.

## Outside components

```ts
import { router } from '@swarakaka/bridge-vue'

const poll = router.poll(10_000, { only: ['queue'] })
poll.stop()
```

`router.poll(interval, reload, options)` accepts the same options plus `bindToPage` (default `true`): the poll stops when another page is shown, so it can never reload a page it was not started for. `reload` may be a function, read on every tick.

## JSON mode

Polling is a page-mode feature. JSON clients (`useJson`, mobile apps) use their own timers against the same routes.
