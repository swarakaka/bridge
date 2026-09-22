import type { Bridge, BridgePage } from '@swarakaka/bridge-core'
import type { App, Plugin } from 'vue'
import { BridgeKey } from './injection'
import { pageStateRef } from './state'

export function createBridgePlugin(bridge: Bridge): Plugin {
  return {
    install(app: App) {
      app.provide(BridgeKey, bridge)
      app.config.globalProperties.$bridge = bridge
      const state = pageStateRef(bridge)
      Object.defineProperty(app.config.globalProperties, '$page', {
        get: () => state.value.page,
        enumerable: true,
      })
    },
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $bridge: Bridge
    $page: BridgePage | null
  }
}
