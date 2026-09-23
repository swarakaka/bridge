# Remembering state

When the user navigates back, Bridge restores the previous page from history state without a request. Component-local state (an open filter panel, a half-typed search box) is lost unless you remember it.

## `useRemember`

::: code-group

```vue [Vue]
<script setup lang="ts">
import { useRemember } from '@swarakaka/bridge-vue'

const filters = useRemember('customers.filters', { search: '', status: 'all' })
</script>
```

```ts [React]
// The React skeleton does not have useRemember yet; use the core router directly.
const bridge = getBridge()
const initial = bridge.router.restore<Filters>('customers.filters') ?? defaults
// ... on change:
bridge.router.remember('customers.filters', filters)
```

:::

The value is written to the current history entry on every change and restored when the entry becomes active again. Keys are namespaced per history entry, so two visits to the same page do not share state. Values must be JSON-serialisable.

## Forms

`useForm` remembers its values with the `remember` option:

```ts
const form = useForm({ name: '', email: '' }, { remember: 'customer-create' })
```

## Scroll positions

Scroll positions are remembered automatically. See [Scroll management](/advanced/scroll-management).

## What is not remembered

Page props come from the history entry's stored page, not from the server, so a page restored from history shows the data it had when the user left it. Call `router.reload()` in `onMounted` if freshness matters, or rely on [stream invalidations](/realtime/streams).
