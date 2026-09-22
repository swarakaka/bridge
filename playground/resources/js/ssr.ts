/**
 * SSR entry: `vite build --ssr resources/js/ssr.ts --outDir bootstrap/ssr`,
 * then `php artisan bridge:ssr` (or `node bootstrap/ssr/ssr.js`).
 */
import { createSsrRenderer, createSsrServer } from '@swarakaka/bridge-vue/server'
import type { Component } from 'vue'

const pages = import.meta.glob<{ default: Component }>('./Pages/**/*.vue')

const render = createSsrRenderer({
    resolve: (name) => {
        const loader = pages[`./Pages/${name}.vue`]
        if (!loader) throw new Error(`Page component [${name}] not found.`)
        return loader()
    },
})

void createSsrServer({ render })
