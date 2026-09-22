import type { Bridge, PageState } from '@swarakaka/bridge-core'
import { createContext, useContext, useSyncExternalStore } from 'react'

export const BridgeContext = createContext<Bridge | null>(null)

export function useBridge(): Bridge {
  const bridge = useContext(BridgeContext)
  if (!bridge)
    throw new Error(
      'Bridge is not available. Render inside createBridgeApp() or a BridgeContext provider.',
    )
  return bridge
}

/** Subscribes a component to the page store (React 18 external-store contract). */
export function usePageState(bridge: Bridge): PageState {
  return useSyncExternalStore(
    (listener) => bridge.store.subscribe(() => listener()),
    () => bridge.store.current,
    () => bridge.store.current,
  )
}
