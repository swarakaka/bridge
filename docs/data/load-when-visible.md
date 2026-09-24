# Load when visible

A [deferred prop](/data/deferred-props) is fetched right after the page renders, whether or not the user ever scrolls to it. `<WhenVisible>` fetches props only when their part of the page approaches the viewport: comments under an article, an activity log at the bottom of a record, a chart further down a dashboard.

On the server, mark the prop [lazy](/data/lazy-props) so the first response leaves it out:

```php
return Bridge::render('Customers/Show', [
    'customer' => CustomerResource::make($customer),
    'activity' => Bridge::lazy(fn () => $customer->activity()->latest()->limit(20)->get()),
]);
```

On the client, wrap the part that needs it:

::: code-group

```vue [Vue]
<WhenVisible data="activity" :buffer="200">
  <template #fallback><p>Loading activity…</p></template>
  <ActivityList :entries="activity" />
</WhenVisible>
```

```tsx [React]
<WhenVisible data="activity" buffer={200} fallback={<p>Loading activity…</p>}>
  <ActivityList entries={activity} />
</WhenVisible>
```

:::

When the wrapper element comes within `buffer` pixels of the viewport, the client sends a partial reload with `X-Bridge-Only: activity` and shows the default content once every listed prop is present. `data` takes one key or a list.

## Options

| Prop     | Default | Meaning                                                                                                       |
| -------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `data`   | —       | Prop key or keys to load.                                                                                     |
| `buffer` | `0`     | Pixels around the viewport that count as visible (the observer's `rootMargin`).                               |
| `always` | `false` | Reload every time the element enters the viewport, for data that goes stale while off-screen.                 |
| `as`     | `div`   | Element rendered around the content; it is the element that is observed. Other attributes are passed on.      |
| `reload` | —       | Extra reload options: `headers`, `preserveScroll`, `onSuccess`, `onFinish`. `only` is always the `data` keys. |

The default slot (Vue) or a function child (React) receives `{ loading }`, which is useful with `always`:

```vue
<WhenVisible data="feed" always v-slot="{ loading }">
  <Feed :items="feed" :refreshing="loading" />
</WhenVisible>
```

## Behaviour

- **Once by default.** After the props arrive the element is no longer observed. Props already on the page, for example after back/forward restored it from history, cause no request.
- **One request for several widgets.** Loads go through `router.reload()`, so widgets that become visible together are combined into one request, a load waits for a navigation the user started, and a load for a page the user has left is dropped.
- **Loading state.** The keys are marked loading like deferred props, so `useDeferred('activity').loading` works for them too.
- **Server rendering** renders the fallback (or the content, if the props are present), and nothing is observed until the page is mounted.
- **No `IntersectionObserver`** (very old browsers): the props load right after mount, like a deferred prop.

## Custom markup

`useWhenVisible` does the same for an element you render yourself:

::: code-group

```vue [Vue]
<script setup lang="ts">
import { ref } from 'vue'
import { useWhenVisible } from '@swarakaka/bridge-vue'

const section = ref<HTMLElement | null>(null)
const { visible, loading } = useWhenVisible(section, 'comments', { buffer: 300 })
</script>

<template>
  <section ref="section">…</section>
</template>
```

```tsx [React]
const section = useRef<HTMLElement>(null)
const { visible, loading } = useWhenVisible(section, 'comments', { buffer: 300 })
return <section ref={section}>…</section>
```

:::

`visible` follows the element for as long as the component is mounted. Pass `trackVisibility: false` when you only need the loading, and the observer is released once the props have loaded.

Core exposes the same behaviour without a view layer as `loadWhenVisible(bridge, element, options)`, which returns a handle with `stop()`.

## Other modes

JSON clients have no viewport: they ask for lazy props with `X-Bridge-Only` like any [partial reload](/data/partial-reloads).
