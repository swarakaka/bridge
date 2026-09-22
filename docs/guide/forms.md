# Forms and validation

```vue
<script setup lang="ts">
import { useForm } from '@swarakaka/bridge-vue'

const form = useForm({ name: '', email: '', avatar: null as File | null })
</script>

<template>
  <form @submit.prevent="form.post('/customers')">
    <input v-model="form.data.name" @blur="form.validate('post', '/customers', 'name')" />
    <p v-if="form.errors.name">{{ form.errors.name }}</p>
    <input type="file" @change="form.data.avatar = $event.target.files?.[0] ?? null" />
    <progress v-if="form.progress" :value="form.progress.percentage" max="100" />
    <button :disabled="form.processing">Save</button>
  </form>
</template>
```

- `form.data` holds the values; `form.errors` the first message per field; `form.allErrors` every message.
- `processing`, `progress`, `wasSuccessful`, `recentlySuccessful`, `isDirty`, `hasErrors`, `validating`.
- `transform(fn)`, `reset(...fields)`, `setDefaults()`, `clearErrors()`, `setError()`, `cancel()`.
- Files switch the request to multipart with `_method` spoofing and XHR upload progress.

## Validation responses

A `ValidationException` becomes a `422` in page mode (Bridge error object) and in JSON mode (Laravel-native `{ message, errors }`). Neither redirects, so there is no session dependency and no error bag juggling. Classic HTML posts keep Laravel's redirect-back behaviour.

## Live validation with Precognition

Add the `precognitive` middleware to the route and call `form.validate(method, url, field)`. Only that field's rules run; a `204` clears its error, a `422` sets it. Other fields' errors are untouched.
