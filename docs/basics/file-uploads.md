# File uploads

Put a `File` (or `Blob` or `FileList`) in the form data and Bridge switches the request to `multipart/form-data` automatically.

```vue
<script setup lang="ts">
const form = useForm({ name: '', avatar: null as File | null })
const onFile = (event: Event) =>
  (form.data.avatar = (event.target as HTMLInputElement).files?.[0] ?? null)
</script>

<template>
  <form @submit.prevent="form.put('/customers/1')">
    <input type="file" accept="image/*" @change="onFile" />
    <progress v-if="form.progress" :value="form.progress.percentage" max="100" />
    <button :disabled="form.processing">Upload</button>
  </form>
</template>
```

What happens:

- Nested data is flattened with Laravel's bracket notation (`meta[tags][0]`).
- `PUT`, `PATCH` and `DELETE` with files are sent as `POST` with a `_method` field, because browsers cannot send multipart bodies with other methods. Laravel's method spoofing handles it.
- Upload progress uses `XMLHttpRequest` (fetch cannot report upload progress) and is exposed as `form.progress`.

On the server, nothing is Bridge-specific:

```php
if ($request->hasFile('avatar')) {
    $customer->update(['avatar_path' => $request->file('avatar')->store('avatars', 'public')]);
}
```

For very large files, direct-to-storage uploads (signed S3 URLs) are outside Bridge's scope and combine naturally with a normal form submission afterwards.
