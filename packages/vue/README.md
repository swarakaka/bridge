# @swarakaka/bridge-vue

Vue 3 adapter for Bridge.

```ts
// resources/js/app.ts
import { createBridgeApp } from '@swarakaka/bridge-vue'

// Pages resolve from ./Pages through the @swarakaka/bridge-vite plugin;
// without it, pass `resolve: (name) => ...`.
createBridgeApp({
  resolveError: () => import('./Pages/Errors/Error.vue'), // optional in-place error page
  withApp: (app) => app.use(i18n), // optional: plugins before mount (and in createSsrRenderer)
})
```

Page components receive props directly and may declare a layout:

```vue
<script setup lang="ts">
import { BridgeHead, BridgeLink, Deferred, useForm, useProp } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'

defineOptions({ layout: AppLayout })
defineProps<{ customers: Paginated<Customer> }>()

const form = useForm({ name: '', email: '' })
</script>

<template>
  <BridgeHead title="Customers" />
  <BridgeLink href="/customers/create" prefetch="hover">New</BridgeLink>
  <Deferred data="stats"><template #fallback>Loading…</template>{{ stats.total }}</Deferred>
  <form @submit.prevent="form.post('/customers')">
    <input v-model="form.name" />
    <p v-if="form.errors.name">{{ form.errors.name }}</p>
    <button :disabled="form.processing">Save</button>
  </form>
</template>
```

Live validation: `form.validate('post', '/customers', 'email')` on blur (route with the `precognitive` middleware). Load more: `router.get(url, { page }, { only: ['items'], merge: true, preserveState: true })` for props marked with `Bridge::merge()`.

Exports: `createBridgeApp`, `createBridgePlugin`, `useBridge`, `usePage`, `useProp`, `useDeferred`, `useForm`, `useRemember`, `BridgeLink`, `Deferred`, `BridgeHead`, plus `router` from the core.

```ts
const { state, on, lastEventAt, reconnectAttempts, close } = useStream('/events')
on('customer.created', (payload) => ...)   // closed automatically when the component scope is disposed
```
