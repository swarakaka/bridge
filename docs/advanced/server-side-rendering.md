# Server-side rendering

Bridge renders the first HTML on the server through a small Node process; the client hydrates it. JSON and stream modes are unaffected.

## Build and run

```ts
// resources/js/ssr.ts
import { createSsrRenderer, createSsrServer } from '@swarakaka/bridge-vue/server'

const render = createSsrRenderer() // pages from ./Pages, through @swarakaka/bridge-vite
void createSsrServer({ render }) // POST /render, GET /health, port from BRIDGE_SSR_URL (13714)
```

`createSsrRenderer` takes the same `resolve`, `pages` and `withApp` options as [`createBridgeApp`](/installation/client-side#initialise-the-app). Share `withApp` between the two entries so the server renders with the same plugins as the client:

```ts
// resources/js/withApp.ts
import type { WithApp } from '@swarakaka/bridge-vue'

export const withApp: WithApp = (app, { ssr }) => {
  app.use(i18n)
  if (!ssr) app.use(analytics) // client only
}

// app.ts: createBridgeApp({ withApp })      ssr.ts: createSsrRenderer({ withApp })
```

```bash
vite build --ssr resources/js/ssr.ts --outDir bootstrap/ssr
php artisan bridge:ssr                 # or: node bootstrap/ssr/ssr.js, under a supervisor in production
```

```dotenv
BRIDGE_SSR_ENABLED=true
BRIDGE_SSR_URL=http://127.0.0.1:13714
```

For HTML requests the Laravel package POSTs the page object to `/render` and embeds the returned `body` inside the root element (marked `data-server-rendered="true"`) and the `head` fragments after `<x-bridge::head />`. Any failure or timeout (`bridge.ssr.timeout`, 2 s) falls back to client rendering and logs a warning. Static shells (`bridge.shell.embed = false`) never use SSR.

::: warning Clear compiled views after upgrading
Run `php artisan view:clear` after upgrading the package, otherwise cached compiled views keep old directive code and SSR appears to do nothing.
:::

## Writing SSR-safe pages

- Never touch `window`, `document` or timers during setup or render. Use `onMounted` for client-only work; guard with `typeof window !== 'undefined'` in computed values.
- `useStream()` does not connect on the server, and connects after mount on the client, so the first render shows `idle` on both sides.
- `<BridgeHead title meta>` records the title and meta tags into the SSR head context. See [Title and meta](/basics/title-and-meta).
- `v-html` on a component is not rendered on the server (it becomes an `innerHTML` property); put it on a native element inside the component's slot.

## Hydration marker

After mounting, the client sets `data-bridge-hydrated="true"` on the root element. Server-rendered markup looks interactive earlier than it is, so end-to-end tests wait for that attribute before interacting.

## Other adapters

The Laravel gateway is adapter-agnostic: it only speaks `POST /render` and expects `{ head, body }`. The HTTP server itself is `createSsrServer` from `@swarakaka/bridge-core/server`; each adapter supplies the renderer and re-exports the server:

```ts
// React: bootstrap/ssr entry
import { createSsrRenderer, createSsrServer } from '@swarakaka/bridge-react/server'

await createSsrServer({ render: createSsrRenderer() })
```

`createSsrRenderer` takes the same `withApp(app, { ssr, page })` as the React `createBridgeApp`, which returns the tree wrapped in application providers (`wrap(page, { page })` still works).
