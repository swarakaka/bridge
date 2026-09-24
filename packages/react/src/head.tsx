import { HeadManager, type HeadData } from '@swarakaka/bridge-core'
import { createContext, useContext, useEffect, useRef } from 'react'

/** Provided by the SSR renderer; BridgeHead records into it on the server. */
export const HeadContext = createContext<HeadData | null>(null)

export interface BridgeHeadProps {
  title?: string | undefined
  meta?: Array<Record<string, string>> | undefined
}

/**
 * Minimal head management. On the server it records title/meta for the SSR
 * response. On the client it sets document.title and owns its own <meta>
 * tags, replacing the server-rendered ones on hydration.
 */
export function BridgeHead({ title = '', meta = [] }: BridgeHeadProps) {
  const server = useContext(HeadContext)
  const manager = useRef<HeadManager | null>(null)
  const metaKey = JSON.stringify(meta)

  if (server) {
    if (title) server.title = title
    server.meta.push(...meta)
  }

  useEffect(() => {
    manager.current = new HeadManager(document)
    return () => {
      manager.current?.dispose()
      manager.current = null
    }
  }, [])

  useEffect(() => {
    manager.current?.apply({ title, meta })
    // metaKey stands in for `meta`, which is a new array on every render.
  }, [title, metaKey])

  return null
}
