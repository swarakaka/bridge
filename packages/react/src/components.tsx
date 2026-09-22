import type { Method } from '@swarakaka/bridge-core'
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { useBridge, usePageState } from './context.js'

export interface BridgeLinkProps {
  href: string
  method?: Method
  data?: Record<string, unknown>
  as?: 'a' | 'button'
  replace?: boolean
  preserveState?: boolean
  preserveScroll?: boolean
  only?: string[]
  prefetch?: 'hover' | 'mount' | false
  className?: string
  children?: ReactNode
}

export function BridgeLink({
  href,
  method = 'get',
  data = {},
  as = 'a',
  replace,
  preserveState,
  preserveScroll,
  only,
  prefetch = 'hover',
  className,
  children,
}: BridgeLinkProps) {
  const bridge = useBridge()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doPrefetch = () => {
    if (method === 'get') void bridge.router.prefetch(href, { only })
  }

  useEffect(() => {
    if (prefetch === 'mount') doPrefetch()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [href])

  const onClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    event.preventDefault()
    void bridge.router.visit(href, {
      method,
      data,
      replace,
      preserveState: preserveState || method !== 'get',
      preserveScroll,
      only,
    })
  }
  const onMouseEnter = () => {
    if (prefetch === 'hover') timer.current = setTimeout(doPrefetch, 75)
  }
  const onMouseLeave = () => {
    if (timer.current) clearTimeout(timer.current)
  }

  if (as === 'button') {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </button>
    )
  }
  return (
    <a
      href={href}
      className={className}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </a>
  )
}

export function Deferred({
  data,
  fallback,
  children,
}: {
  data: string | string[]
  fallback?: ReactNode
  children: ReactNode
}) {
  const state = usePageState(useBridge())
  const keys = Array.isArray(data) ? data : [data]
  const props = (state.page?.props ?? {}) as Record<string, unknown>
  return <>{keys.every((k) => k in props) ? children : (fallback ?? null)}</>
}
