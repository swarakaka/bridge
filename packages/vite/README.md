# @swarakaka/bridge-vite

Vite plugin for Bridge. It lets `createBridgeApp()` and `createSsrRenderer()` find page components without a `resolve` callback.

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

```ts
// resources/js/app.ts
import { createBridgeApp } from '@swarakaka/bridge-vue'

createBridgeApp() // Customers/Index → ./Pages/Customers/Index.vue, one chunk per page
```

At build time the plugin rewrites calls imported from `@swarakaka/bridge-vue`, `@swarakaka/bridge-react` and their `/server` entries:

- A call without `resolve` gets a resolver over `import.meta.glob('./Pages/**/*.vue')` (React: `.tsx`, then `.jsx`), relative to the calling file.
- A `pages` option is replaced by the resolver it describes: `pages: './Views'`, or `pages: { path, extension, lazy, transform }`. `path`, `extension` and `lazy` must be literals.
- A call that already passes `resolve`, or whose options are not an object literal, is left alone.

Other adapters can opt in: `bridge({ adapters: { '@acme/bridge-solid': { extensions: ['.tsx'] } } })`.

Documentation: [Client-side setup](https://github.com/swarakaka/bridge/blob/main/docs/installation/client-side.md).
