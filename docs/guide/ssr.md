# Server-side rendering

Bridge renders the first HTML on the server through a small Node process; the client hydrates it. JSON and stream modes are unaffected.

## Build and run

```ts
// resources/js/ssr.ts
import { createSsrRenderer, createSsrServer } from '@swarakaka/bridge-vue/server'

const pages = import.meta.glob('./Pages/**/*.vue')
const render = createSsrRenderer({ resolve: (name) => pages[`./Pages/${name}.vue`]!() })
void createSsrServer({ render }) // POST /render, GET /health, port from BRIDGE_SSR_URL (13714)
```

```bash
vite build --ssr resources/js/ssr.ts --outDir bootstrap/ssr
php artisan bridge:ssr                 # or: node bootstrap/ssr/ssr.js, under a supervisor in production
```

```dotenv
BRIDGE_SSR_ENABLED=true
BRIDGE_SSR_URL=http://127.0.0.1:13714
```

For HTML requests the Laravel package POSTs the page object to `/render` and embeds the returned `body` inside `#app` (marked `data-server-rendered="true"`) and the `head` fragments after `@bridgeHead`. Any failure or timeout (`bridge.ssr.timeout`, 2 s) falls back to client rendering and logs a warning. Static shells (`bridge.shell.embed = false`) never use SSR.

::: warning Clear compiled views after upgrading
The `@bridge` and `@bridgeHead` directives changed to carry SSR output. Run `php artisan view:clear` after upgrading the package, otherwise cached compiled views keep the old directive code and SSR appears to do nothing.
:::

## Writing SSR-safe pages

- Never touch `window`, `document` or timers during setup or render. Use `onMounted` for client-only work; guard with `typeof window !== 'undefined'` in computed values.
- `useStream()` does not connect on the server.
- `<BridgeHead title meta>` records the title and meta tags into the SSR head context.
- `v-html` on a component is not rendered on the server (it becomes an `innerHTML` property); put it on a native element inside the component's slot.

## Hydration marker

After mounting, the client sets `data-bridge-hydrated="true"` on the root element. Server-rendered markup looks interactive earlier than it is, so end-to-end tests wait for that attribute before interacting.
