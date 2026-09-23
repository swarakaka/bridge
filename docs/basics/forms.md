# Forms

`useForm` gives you a reactive form with values, errors, submission state and helpers.

::: code-group

```vue [Vue]
<script setup lang="ts">
import { useForm } from '@swarakaka/bridge-vue'

const form = useForm({ name: '', email: '' })
</script>

<template>
  <form @submit.prevent="form.post('/customers')">
    <input v-model="form.data.name" />
    <p v-if="form.errors.name">{{ form.errors.name }}</p>
    <input v-model="form.data.email" type="email" />
    <p v-if="form.errors.email">{{ form.errors.email }}</p>
    <button :disabled="form.processing">Save</button>
    <span v-if="form.recentlySuccessful">Saved.</span>
  </form>
</template>
```

```tsx [React]
import { useForm } from '@swarakaka/bridge-react'

export default function Create() {
  const form = useForm({ name: '', email: '' })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.post('/customers')
      }}
    >
      <input value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} />
      {form.errors.name && <p>{form.errors.name}</p>}
      <button disabled={form.processing}>Save</button>
    </form>
  )
}
```

:::

## State

| Property                              | Meaning                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `data`                                | The values.                                                                           |
| `errors`                              | First message per field. `allErrors` holds every message.                             |
| `processing`                          | A submission is in flight.                                                            |
| `progress`                            | Upload progress `{ loaded, total, percentage }` while a multipart request is sending. |
| `wasSuccessful`, `recentlySuccessful` | Set after a success; `recentlySuccessful` resets after 2 s.                           |
| `isDirty`, `hasErrors`, `validating`  | Derived state.                                                                        |

## Methods

`submit(method, url, options)`, `get`, `post`, `put`, `patch`, `delete`, `validate` (see [Validation](/basics/validation)), `setData`, `transform(fn)`, `reset(...fields)`, `setDefaults()`, `setError`, `clearErrors`, `cancel`.

Submission options are the [visit options](/basics/manual-visits) plus `resetOnSuccess`. On success the current values become the new defaults unless `resetOnSuccess` is set.

## Remembering form state

Pass `remember: 'customer-create'` in the options to keep the values in history state so they survive back and forward navigation. See [Remembering state](/advanced/remembering-state).
