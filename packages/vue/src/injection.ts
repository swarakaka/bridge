import type { Bridge } from '@swarakaka/bridge-core'
import { inject, type InjectionKey } from 'vue'

export const BridgeKey: InjectionKey<Bridge> = Symbol('bridge')

export function useBridge(): Bridge {
  const bridge = inject(BridgeKey, null)
  if (!bridge)
    throw new Error('Bridge is not installed. Call createBridgeApp() or app.use(bridgePlugin).')
  return bridge
}
