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
    <input v-model="form.name" />
    <p v-if="form.errors.name">{{ form.errors.name }}</p>
    <input v-model="form.email" type="email" />
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

In Vue each field is a property of the form: `form.name` reads and writes the same value as `form.data.name`, so `v-model="form.name"`, `form.items = [...form.items, item]` and `form.data.items.push(item)` are equivalent, and `isDirty`, `reset()`, submission and `remember` see either style. React forms keep values under `form.data` and change them with `setData`.

### Reserved field names

A field cannot share a name with a form member: `data`, `defaults`, `errors`, `allErrors`, `processing`, `progress`, `validating`, `isDirty`, the methods, and the internals such as `options` and `router`. `useForm` throws when the initial values contain one. Rename the field (`items` instead of `data`), or nest it under another key and read it through `form.data` (`form.data.meta.progress`).

## State

| Property                              | Meaning                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `data`                                | The values (in Vue also available as `form.<field>`).                                 |
| `errors`                              | First message per field. `allErrors` holds every message.                             |
| `processing`                          | A submission is in flight.                                                            |
| `progress`                            | Upload progress `{ loaded, total, percentage }` while a multipart request is sending. |
| `wasSuccessful`, `recentlySuccessful` | Set after a success; `recentlySuccessful` resets after 2 s.                           |
| `isDirty`, `hasErrors`, `validating`  | Derived state.                                                                        |

## Methods

`submit(method, url, options)`, `get`, `post`, `put`, `patch`, `delete`, `validate` (see [Validation](/basics/validation)), `setData`, `transform(fn)`, `reset(...fields)`, `resetAndClearErrors(...fields)`, `setDefaults()`, `setError`, `clearErrors`, `dontRemember(...fields)`, `cancel`.

Submission options are the [visit options](/basics/manual-visits) plus `resetOnSuccess`. On success the current values become the new defaults unless `resetOnSuccess` is set.

## Remembering form state

Pass a key as the first argument (or `remember: 'customer-create'` in the options) to keep the values in history state so they survive back and forward navigation. Chain `dontRemember` for fields that must not be stored, such as passwords:

```ts
const form = useForm('login', { email: '', password: '' }).dontRemember('password')
```

See [Remembering state](/advanced/remembering-state).
