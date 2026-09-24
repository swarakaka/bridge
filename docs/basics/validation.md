# Validation

Validate as you always do: form requests or `$request->validate()`. Bridge represents a `ValidationException` per mode:

| Mode                     | Response                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Page                     | `422` with a Bridge error object: `{ type: "error", error: { kind: "validation", message, errors } }` |
| JSON                     | `422` with Laravel's `{ message, errors }`                                                            |
| HTML (classic form post) | Laravel's redirect back with errors in the session                                                    |

In page mode there is no redirect: the client receives the errors in the response to the request that failed and gives them to the form that submitted. The page is untouched, nothing is written to the session, and bearer-token clients see exactly what browsers see.

```vue
<p v-if="form.errors.email">{{ form.errors.email }}</p>
```

## Live validation with Precognition

Add Laravel's `precognitive` middleware to the route, create the form with its endpoint, and validate a field when it loses focus:

```php
Route::resource('customers', CustomerController::class)->middleware('precognitive');
```

```vue
<script setup lang="ts">
const form = useForm('post', '/customers', { name: '', email: '', avatar: null as File | null })
</script>

<template>
  <form @submit.prevent="form.submit()">
    <input v-model="form.email" @blur="form.validate('email')" />
    <p v-if="form.invalid('email')">{{ form.errors.email }}</p>
    <p v-else-if="form.valid('email')">Looks good.</p>
    <button :disabled="form.processing">Save</button>
  </form>
</template>
```

Only the requested fields' rules run (`Precognition-Validate-Only`). A `422` sets their errors, a `204` clears them, and other fields' errors are untouched. `form.submit()` without a method and URL sends to the same endpoint. `useForm(data).withPrecognition('post', '/customers')` binds an endpoint after creation, and `useJsonForm` takes the same arguments.

| Member                                                                           | Meaning                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate('email')`, `validate(['a', 'b'])`                                      | Validate these fields                                                                                                                                   |
| `validate()`                                                                     | Validate the touched fields; nothing is sent when none are                                                                                              |
| `validate({ only, onBefore, onSuccess, onInvalid, onError, onFinish, headers })` | Options; `onBefore` returning `false` skips the request                                                                                                 |
| `touch('email')`, `touch(['a', 'b'])`, `touch()`                                 | Mark fields (all top-level fields without arguments) as touched, without validating. `validate(field)` does not touch                                   |
| `touched('email')`, `touched()`                                                  | Whether that field, or any field, was touched                                                                                                           |
| `valid('email')`                                                                 | Validated through Precognition and without an error                                                                                                     |
| `invalid('email')`                                                               | Has an error                                                                                                                                            |
| `validating`                                                                     | A validation request is in flight                                                                                                                       |
| `setValidationTimeout(ms)`                                                       | Debounce window, default `1500`. The first call is sent at once; calls within the window are combined into one request at its end. `0` sends every call |
| `validateFiles()`                                                                | Include files. By default `File`, `Blob` and `FileList` values are left out of validation requests, and fields holding them are not validated           |

`reset()` forgets touched and validated state for the fields it resets. Messages are strings in `form.errors` (the first per field) and lists in `form.allErrors`.

The explicit form `form.validate(method, url, field)` still works: it validates against that endpoint at once, without the debounce, with every value including files, and with no field it runs every rule.

## Named error bags

Bridge does not need them. Each form owns the errors of the request it sent, so several forms on one page cannot interfere.
