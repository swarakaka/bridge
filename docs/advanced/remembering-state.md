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

```tsx [React]
import { useRemember } from '@swarakaka/bridge-react'

const [filters, setFilters] = useRemember('customers.filters', { search: '', status: 'all' })
```

:::

The value is written to the current history entry on every change and restored after mount when the entry becomes active again (after mount, so a server-rendered page hydrates with the same markup). Keys are namespaced per history entry, so two visits to the same page do not share state. Values must be JSON-serialisable.

## Forms

`useForm` (Vue and React) remembers its values when you give it a key, either first or as the `remember` option:

```ts
const form = useForm('customer-create', { name: '', email: '' })
// same as
const form = useForm({ name: '', email: '' }, { remember: 'customer-create' })
```

History state is stored by the browser, so keep secrets out of it with `dontRemember`. It takes top-level field names and applies to both writing and restoring:

```ts
const login = useForm('login', { email: '', password: '' }).dontRemember('password')
```

## Scroll positions

Scroll positions are remembered automatically. See [Scroll management](/advanced/scroll-management).

## What is not remembered

Page props come from the history entry's stored page, not from the server, so a page restored from history shows the data it had when the user left it. Call `router.reload()` in `onMounted` if freshness matters, or rely on [stream invalidations](/realtime/streams).
