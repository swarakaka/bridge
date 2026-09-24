# Client-side setup

Requirements: Node 22.13 or newer, Vite, and Vue 3.5 or newer (or React 18+ for the experimental adapter).

## Install

::: code-group

```bash [Vue]
pnpm add @swarakaka/bridge-vue vue
pnpm add -D @swarakaka/bridge-vite
```

```bash [React]
pnpm add @swarakaka/bridge-react react react-dom
pnpm add -D @swarakaka/bridge-vite
```

:::

## Vite

Add the Bridge plugin next to `laravel-vite-plugin` and your framework plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import laravel from 'laravel-vite-plugin'
import vue from '@vitejs/plugin-vue'
import bridge from '@swarakaka/bridge-vite'

export default defineConfig({
  plugins: [laravel({ input: ['resources/js/app.ts'] }), bridge(), vue()],
})
```

The plugin lets `createBridgeApp()` find page components by itself, so you do not write a resolver. It is optional: without it, pass `resolve` yourself (see [below](#resolving-pages-yourself)). Build with `vite build`; for [server-side rendering](/advanced/server-side-rendering) add an SSR build.

## Initialise the app

::: code-group

```ts [Vue]
// resources/js/app.ts
import { createBridgeApp } from '@swarakaka/bridge-vue'

createBridgeApp()
```

```tsx [React]
// resources/js/app.tsx
import { createBridgeApp } from '@swarakaka/bridge-react'

createBridgeApp()
```

:::

The component name from the server (`Customers/Index`) maps to a file under `Pages/`, next to the file that calls `createBridgeApp`: `resources/js/Pages/Customers/Index.vue` (React: `.tsx`, then `.jsx`). Each page is its own chunk, loaded on demand. `createBridgeApp` reads the page embedded in the shell, resolves its component, mounts (or hydrates, when the page was server-rendered) and starts the router.

### Another pages directory

`pages` points the plugin somewhere else. The object form also sets the extension, turns off lazy loading, or maps names to file names:

```ts
createBridgeApp({ pages: './Views' })

createBridgeApp({
  pages: {
    path: './Pages',
    extension: ['.vue', '.page.vue'],
    lazy: false, // bundle every page up front
    transform: (name) => name.replace('.', '/'), // server name → file name
  },
})
```

`path`, `extension` and `lazy` must be literals: the plugin reads them at build time and compiles them into an `import.meta.glob` pattern.

### Customising the app with `withApp`

`withApp` runs before the application mounts, with the app and `{ ssr, page }`. `page` is the first page, so its props can configure plugins (a locale, for example):

::: code-group

```ts [Vue]
import { createBridgeApp } from '@swarakaka/bridge-vue'
import { createI18n } from 'vue-i18n'

createBridgeApp({
  withApp(app, { page }) {
    app.use(createI18n({ locale: String(page?.props.locale ?? 'en') }))
  },
})
```

```tsx [React]
import { createBridgeApp } from '@swarakaka/bridge-react'

createBridgeApp({
  withApp: (app, { page }) => <ThemeProvider theme={page?.props.theme}>{app}</ThemeProvider>,
})
```

:::

Vue receives the app instance (register plugins, components, directives); React receives the element tree and returns it wrapped. Keep `withApp` in a module of its own and pass the same function to `createSsrRenderer`, so the server renders with the same plugins; `ssr` tells them apart. For complete control over mounting, the Vue adapter still accepts `setup` (not together with `withApp`).

### Resolving pages yourself

Without the Vite plugin (or for a custom lookup), pass `resolve`. It receives the component name and returns the component or a promise of it:

::: code-group

```ts [Vue]
const pages = import.meta.glob('./Pages/**/*.vue')

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.vue`]!(),
})
```

```tsx [React]
const pages = import.meta.glob('./Pages/**/*.tsx')

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.tsx`]!(),
})
```

:::

An explicit `resolve` always wins; the plugin leaves that call alone.

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

## Options

| Option                  | Purpose                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `resolve`               | Component resolver. Generated from `./Pages` by `@swarakaka/bridge-vite` when omitted.                  |
| `pages`                 | Pages directory, or `{ path, extension, lazy, transform }`, compiled into `resolve` by the Vite plugin. |
| `withApp`               | `(app, { ssr, page })`: customise the app before it mounts (Vue) or wrap it (React).                    |
| `resolveError`          | Component rendered in place for non-validation errors. See [Error handling](/advanced/error-handling).  |
| `setup`                 | Vue: custom mounting; receives `{ el, App, props, plugin, bridge }` and returns the Vue app.            |
| `id`                    | Root element id (default `app`).                                                                        |
| `page`                  | Start from this page instead of the embedded one.                                                       |
| `cache`                 | Prefetch cache TTLs. See [Prefetching](/data/prefetching).                                              |
| `hardReloadOnError`     | Full document load instead of an in-place error page.                                                   |
| `allowExternalNavigate` | Follow `navigate` stream events to other origins.                                                       |
