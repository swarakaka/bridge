import { loadWhenVisible, type ReloadOptions } from '@swarakaka/bridge-core'
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { useBridge, usePageState } from './context.js'

export interface UseWhenVisibleOptions {
  /** Start loading this many pixels before the element enters the viewport. */
  buffer?: number | undefined
  /** Reload on every entry into the viewport instead of once. */
  always?: boolean | undefined
  /** Extra reload options (headers, callbacks); `only` is always the keys. */
  reload?: Omit<ReloadOptions, 'only' | 'except'> | undefined
  /**
   * Keep `visible` up to date after the props loaded (default true). `false`
   * disconnects the observer once there is nothing left to load.
   */
  trackVisibility?: boolean | undefined
}

/**
 * Loads props when the referenced element approaches the viewport (PLAN §13.1).
 * `visible` follows the element; `loading` is true while any of the keys is
 * loading. Observation starts in an effect, so server rendering runs nothing.
 */
export function useWhenVisible(
  ref: RefObject<Element | null>,
  keys: string | string[],
  options: UseWhenVisibleOptions = {},
): { visible: boolean; loading: boolean } {
  const bridge = useBridge()
  const state = usePageState(bridge)
  const [visible, setVisible] = useState(false)
  const list = Array.isArray(keys) ? keys : [keys]
  const keyString = list.join(',')
  // The latest reload options, without restarting the observer when an inline object changes.
  const reload = useRef(options.reload)
  reload.current = options.reload

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const handle = loadWhenVisible(bridge, element, {
      keys: keyString.split(',').filter((key) => key !== ''),
      buffer: options.buffer,
      always: options.always,
      reload: reload.current,
      onVisibilityChange: options.trackVisibility === false ? undefined : setVisible,
    })
    return () => handle.stop()
  }, [bridge, ref, keyString, options.buffer, options.always, options.trackVisibility])

  return { visible, loading: list.some((key) => state.loading.has(key)) }
}

export interface WhenVisibleProps
  extends
    Omit<HTMLAttributes<HTMLElement>, 'children'>,
    Omit<UseWhenVisibleOptions, 'trackVisibility'> {
  data: string | string[]
  /** Element rendered around the content and observed (default `div`). */
  as?: string | undefined
  fallback?: ReactNode
  children?: ReactNode | ((state: { loading: boolean }) => ReactNode)
}

/**
 * Loads props when the element approaches the viewport and renders `fallback`
 * until every listed prop is present. Pair it with `Bridge::lazy()` on the server.
 */
export function WhenVisible({
  data,
  buffer,
  always,
  reload,
  as = 'div',
  fallback,
  children,
  ...attributes
}: WhenVisibleProps) {
  const ref = useRef<HTMLElement>(null)
  const { loading } = useWhenVisible(ref, data, {
    buffer,
    always,
    reload,
    trackVisibility: false,
  })
  const state = usePageState(useBridge())
  const keys = Array.isArray(data) ? data : [data]
  const props = (state.page?.props ?? {}) as Record<string, unknown>
  const ready = keys.every((key) => key in props)
  const content = ready
    ? typeof children === 'function'
      ? children({ loading })
      : children
    : (fallback ?? null)
  return createElement(as, { ...attributes, ref }, content)
}
