import '../css/app.css'
import { createBridgeApp } from '@swarakaka/bridge-vue'

// Pages resolve from ./Pages through the @swarakaka/bridge-vite plugin.
void createBridgeApp({
    resolveError: () => import('./Pages/Errors/Error.vue'),
})
