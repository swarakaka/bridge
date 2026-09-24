/**
 * SSR entry: `vite build --ssr resources/js/ssr.ts --outDir bootstrap/ssr`,
 * then `php artisan bridge:ssr` (or `node bootstrap/ssr/ssr.js`).
 */
import { createSsrRenderer, createSsrServer } from '@swarakaka/bridge-vue/server'

// Pages resolve from ./Pages through the @swarakaka/bridge-vite plugin.
const render = createSsrRenderer()

void createSsrServer({ render })
