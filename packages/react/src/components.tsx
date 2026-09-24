import type {
  BridgeError,
  BridgePage,
  Method,
  ValidationErrors,
  Visit,
} from '@swarakaka/bridge-core'
import {
  useEffect,
  useRef,
  type AnchorHTMLAttributes,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useBridge, usePageState } from './context.js'

// `onError`/`onInvalid` are visit callbacks here, not the DOM events of the same name.
type DomProps = Omit<
  AnchorHTMLAttributes<HTMLElement>,
  'href' | 'type' | 'onError' | 'onInvalid' | 'children'
>

export interface BridgeLinkProps extends DomProps {
  href: string
  method?: Method
  data?: Record<string, unknown>
  as?: 'a' | 'button'
  replace?: boolean
  preserveState?: boolean
  preserveScroll?: boolean
  only?: string[]
  except?: string[]
  headers?: Record<string, string>
  prefetch?: 'hover' | 'mount' | false
  /** Added to `className` while the current page URL matches `href` (query ignored). */
  activeClass?: string
  onBefore?: (visit: Visit) => void | boolean
  onStart?: (visit: Visit) => void
  onFinish?: (visit: Visit) => void
  onSuccess?: (page: BridgePage) => void
  onInvalid?: (errors: ValidationErrors) => void
  /** A non-validation error response for the visit (not the DOM `error` event). */
  onError?: (error: BridgeError['error']) => void
  children?: ReactNode
}

/**
 * Anchor that navigates through the router. `prefetch="hover"` (default)
 * warms the page cache after a short hover; `"mount"` prefetches immediately.
 * Other attributes pass through to the element.
 */
export function BridgeLink({
  href,
  method = 'get',
  data = {},
  as = 'a',
  replace,
  preserveState,
  preserveScroll,
  only,
  except,
  headers,
  prefetch = 'hover',
  activeClass,
  className,
  onBefore,
  onStart,
  onFinish,
  onSuccess,
  onInvalid,
  onError,
  onClick: userOnClick,
  onMouseEnter: userOnMouseEnter,
  onMouseLeave: userOnMouseLeave,
  onFocus: userOnFocus,
  onBlur: userOnBlur,
  children,
  ...attributes
}: BridgeLinkProps) {
  const bridge = useBridge()
  const state = usePageState(bridge)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doPrefetch = () => {
    if (method === 'get') void bridge.router.prefetch(href, { only, except, headers })
  }

  useEffect(() => {
    if (prefetch === 'mount') doPrefetch()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [href])

  const onClick = (event: MouseEvent<HTMLElement>) => {
    userOnClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      attributes.target === '_blank'
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
      except,
      headers,
      onBefore,
      onStart,
      onFinish,
      onSuccess,
      onInvalid: onInvalid ? (errors) => onInvalid(errors) : undefined,
      onError,
    })
  }
  const warm = () => {
    if (prefetch === 'hover') timer.current = setTimeout(doPrefetch, 75)
  }
  const cool = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const current = state.page?.url ?? ''
  const active = activeClass && current.split('?')[0] === href.split('?')[0]
  const classes = [className, active ? activeClass : null].filter(Boolean).join(' ') || undefined
  const handlers = {
    onClick,
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      userOnMouseEnter?.(event)
      warm()
    },
    onMouseLeave: (event: MouseEvent<HTMLElement>) => {
      userOnMouseLeave?.(event)
      cool()
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      userOnFocus?.(event)
      warm()
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      userOnBlur?.(event)
      cool()
    },
  }

  if (as === 'button') {
    return (
      <button type="button" {...attributes} className={classes} {...handlers}>
        {children}
      </button>
    )
  }
  return (
    <a {...attributes} href={href} className={classes} {...handlers}>
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
