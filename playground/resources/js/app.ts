import '../css/app.css'
import { createBridgeApp } from '@swarakaka/bridge-vue'
import type { Component } from 'vue'

const pages = import.meta.glob<{ default: Component }>('./Pages/**/*.vue')
const errorPage = () => import('./Pages/Errors/Error.vue')

void createBridgeApp({
    resolve: (name) => {
        const loader = pages[`./Pages/${name}.vue`]
        if (!loader) throw new Error(`Page component [${name}] not found.`)
        return loader()
    },
    resolveError: () => errorPage(),
})
