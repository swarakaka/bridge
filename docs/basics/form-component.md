# Form component

`<BridgeForm>` submits a form written as plain inputs. It reads the values from the fields by `name`, so there is no `v-model` or state per field, and gives you the same form object as [`useForm`](/basics/forms): errors, `processing`, `isDirty`, `reset()`, [live validation](/basics/validation#live-validation-with-precognition) and the rest.

::: code-group

```vue [Vue]
<script setup lang="ts">
import { BridgeForm } from '@swarakaka/bridge-vue'
</script>

<template>
  <BridgeForm v-slot="form" action="/login" :reset-on-error="['password']">
    <input name="email" type="email" value="ada@example.com" />
    <p v-if="form.errors.email">{{ form.errors.email }}</p>
    <input name="password" type="password" />
    <label><input type="checkbox" name="remember" value="1" /> Remember me</label>
    <button :disabled="form.processing">Sign in</button>
  </BridgeForm>
</template>
```

```tsx [React]
import { BridgeForm } from '@swarakaka/bridge-react'

export default function Login() {
  return (
    <BridgeForm action="/login" resetOnError={['password']}>
      {(form) => (
        <>
          <input name="email" type="email" defaultValue="ada@example.com" />
          {form.errors.email && <p>{form.errors.email}</p>}
          <input name="password" type="password" />
          <label>
            <input type="checkbox" name="remember" value="1" /> Remember me
          </label>
          <button disabled={form.processing}>Sign in</button>
        </>
      )}
    </BridgeForm>
  )
}
```

:::

## Values

The component reads the fields when it mounts (those are the defaults), on every change, and on submit, exactly as the browser would send them:

| Field name                      | Value                          |
| ------------------------------- | ------------------------------ |
| `email`                         | `{ email: '…' }`               |
| `user[name]`, `user.name`       | `{ user: { name: '…' } }`      |
| `tags[]` (several fields)       | `{ tags: ['a', 'b'] }`         |
| `items[0][qty]`, `items[][qty]` | `{ items: [{ qty: '1' }, …] }` |
| `app\.name`                     | `{ 'app.name': '…' }`          |

Give checkboxes a `value` (`value="1"`): an unchecked checkbox sends nothing, and one without a value sends `"on"`. File inputs give a `File`, or `null` when empty, and are never remembered in history state. Set initial values in the markup: `value`, `checked` and `selected` in Vue; `defaultValue` (inputs, textareas and selects) and `defaultChecked` in React.

`form.reset()`, `resetOnSuccess`, `resetOnError` and restored `remember` state are written back into the fields. After a successful submit the submitted values become the defaults (unless `setDefaultsOnSuccess` is `false`), and the fields' defaults follow, so a native `<button type="reset">` agrees with `form.reset()`.

## Props

| Prop                                 | Meaning                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`, `method`                   | Where and how to submit (`post` by default). `form.submit()` and `form.validate(field)` use them.                                                                                  |
| `json`                               | Submit in [JSON mode](/beyond/json-mode#forms-over-json-usejsonform) instead of as a page visit; the response is in `form.result`.                                                 |
| `options`                            | Visit options for each submission: `preserveScroll`, `preserveState`, `preserveUrl`, `replace`, `only`, `except`, `showProgress`, `queryStringArrayFormat`, `invalidateCacheTags`. |
| `transform`, `headers`               | Change the data before it is sent; headers for every submission.                                                                                                                   |
| `resetOnSuccess`, `resetOnError`     | `true` or a list of fields to reset after a success, or after a validation error or other error response.                                                                          |
| `setDefaultsOnSuccess`               | Default `true`: the submitted values become the new defaults.                                                                                                                      |
| `disableWhileProcessing`             | Sets `inert` on the form while a submission is in flight.                                                                                                                          |
| `cancelOnUnmount`                    | Default `true`: abort an in-flight submission when the form unmounts.                                                                                                              |
| `validationTimeout`, `validateFiles` | Precognition debounce (default 1500 ms) and whether files are sent with validation requests.                                                                                       |
| `remember`                           | Keep the values in history state under this key.                                                                                                                                   |

Events (`@success`, `@invalid`, … in Vue; `onSuccess`, `onInvalid`, … in React) are the [visit callbacks](/basics/manual-visits), or the [`useJsonForm` callbacks](/beyond/json-mode#forms-over-json-usejsonform) with `json`: `before`, `start`, `progress`, `success`, `invalid`, `error`, `exception`, `cancel`, `finish`. Other attributes go to the `<form>` element.

## Reaching the form

- **The slot** (Vue `v-slot="form"`) or **the children function** (React).
- **A ref**: `formRef.value.submit()`, `formRef.value.isDirty` (Vue template ref); `ref={formRef}` then `formRef.current.submit()` (React).
- **`useFormContext()`** in any component inside the form, for shared inputs or submit buttons. It returns `null` outside a `<BridgeForm>`.

```vue
<script setup lang="ts">
import { useFormContext } from '@swarakaka/bridge-vue'

const form = useFormContext()
</script>

<template>
  <button :disabled="!form?.isDirty || form?.processing">Save</button>
</template>
```

Submitting always goes through the client. Without JavaScript the browser would post the form itself, which Bridge does not support (a classic post would also need Laravel's `_token` field).
