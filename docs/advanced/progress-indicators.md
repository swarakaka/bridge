# Progress indicators

Bridge does not ship a progress bar, so you can use the one that matches your design. The [router events](/advanced/events) give you everything a bar needs.

## A bar with NProgress

```ts
import NProgress from 'nprogress'
import { getBridge } from '@swarakaka/bridge-vue'

let timer: ReturnType<typeof setTimeout> | undefined
const bridge = getBridge()

bridge.on('start', (visit) => {
  if (!visit.showProgress) return // background visits, e.g. `showProgress: false` on "load more"
  timer = setTimeout(() => NProgress.start(), 250) // only for visits slower than 250 ms
})
bridge.on('progress', ({ progress }) => {
  if (progress.percentage !== null)
    NProgress.set(Math.max(NProgress.status ?? 0, progress.percentage / 100))
})
bridge.on('finish', () => {
  clearTimeout(timer)
  NProgress.done()
})
```

The delay avoids a flicker on fast navigations and on pages served from the prefetch cache. Pass `showProgress: false` to a visit (or a `BridgeLink`) that should not move the bar; prefetches never emit visit events.

## Per-element indicators

Forms expose `processing`, and a visit's promise resolves when it finishes:

```vue
<button :disabled="form.processing">
  <Spinner v-if="form.processing" /> Save
</button>
```

## Upload progress

`form.progress` and the `progress` event carry `{ loaded, total, percentage }` while a multipart body is uploading. See [File uploads](/basics/file-uploads).

## Long-running server work

For work that continues after the response, stream `progress` control events from a job and listen with `on('progress', …)` on the [stream client](/realtime/client), or use a one-off producer stream.
