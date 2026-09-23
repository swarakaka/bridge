# Client-side setup

Requirements: Node 22.13 or newer, Vite, and Vue 3.5 or newer (or React 18+ for the experimental adapter).

## Install

::: code-group

```bash [Vue]
pnpm add @swarakaka/bridge-vue vue
```

```bash [React]
pnpm add @swarakaka/bridge-react react react-dom
```

:::

## Initialise the app

::: code-group

```ts [Vue]
// resources/js/app.ts
import { createBridgeApp } from '@swarakaka/bridge-vue'

const pages = import.meta.glob('./Pages/**/*.vue')

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.vue`]!(),
})
```

```tsx [React]
// resources/js/app.tsx
import { createBridgeApp } from '@swarakaka/bridge-react'

const pages = import.meta.glob('./Pages/**/*.tsx')

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.tsx`]!(),
})
```

:::

`resolve` receives the component name from the server (`Customers/Index`) and returns the component or a promise of it. `createBridgeApp` reads the page embedded in the shell, resolves its component, mounts (or hydrates, when the page was server-rendered) and starts the router.

## Page components

Page components receive the page props as component props. A static `layout` wraps them:

::: code-group

```vue [Vue]
<script setup lang="ts">
import AppLayout from '@/Layouts/AppLayout.vue'

defineOptions({ layout: AppLayout })
defineProps<{ customers: Paginated<Customer> }>()
</script>
```

```tsx [React]
import AppLayout from '@/Layouts/AppLayout'
import type { PageComponent } from '@swarakaka/bridge-react'

const Index: PageComponent = ({ customers }) => <ul>…</ul>
Index.layout = AppLayout
export default Index
```

:::

Layouts are rendered once and persist across navigations; the page component inside them is re-created on each navigation unless the visit preserves state.

## Vite

Bridge needs nothing special from Vite. Use `laravel-vite-plugin` as usual and reference `resources/js/app.ts` from the shell. Build with `vite build`; for [server-side rendering](/advanced/server-side-rendering) add an SSR build.

## Options

| Option                  | Purpose                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `resolve`               | Component resolver (required).                                                                         |
| `resolveError`          | Component rendered in place for non-validation errors. See [Error handling](/advanced/error-handling). |
| `setup`                 | Custom mounting: receives `{ el, App, props, plugin, bridge }` and returns the Vue app.                |
| `id`                    | Root element id (default `app`).                                                                       |
| `page`                  | Start from this page instead of the embedded one.                                                      |
| `cache`                 | Prefetch cache TTLs. See [Prefetching](/data/prefetching).                                             |
| `hardReloadOnError`     | Full document load instead of an in-place error page.                                                  |
| `allowExternalNavigate` | Follow `navigate` stream events to other origins.                                                      |
