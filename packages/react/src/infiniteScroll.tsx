import {
  InfiniteScroll as InfiniteScrollController,
  type InfiniteScrollOptions,
  type InfiniteScrollState,
} from '@swarakaka/bridge-core'
import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { useBridge } from './context.js'

export type UseInfiniteScrollOptions = Omit<InfiniteScrollOptions, 'prop' | 'afterRender'>

export interface UseInfiniteScrollReturn extends InfiniteScrollState {
  loadNext(): Promise<void>
  loadPrevious(): Promise<void>
  /** Attach to an element before the items: reaching it loads upward. */
  before: RefObject<HTMLDivElement | null>
  /** Attach to an element after the items: reaching it loads the next page. */
  after: RefObject<HTMLDivElement | null>
}

/**
 * Infinite scroll for a `Bridge::scroll()` prop with your own markup (PLAN
 * §13.4). Observation starts in an effect, so server rendering loads nothing
 * and reports the manual state. Options are read when the component mounts.
 */
export function useInfiniteScroll(
  prop: string,
  options: UseInfiniteScrollOptions = {},
): UseInfiniteScrollReturn {
  const bridge = useBridge()
  const initial = useRef(options)
  const controller = useMemo(
    () =>
      new InfiniteScrollController(bridge, typeof window === 'undefined' ? null : window, {
        ...initial.current,
        prop,
      }),
    [bridge, prop],
  )
  const state = useSyncExternalStore(
    controller.subscribe,
    () => controller.state,
    () => controller.state,
  )
  const before = useRef<HTMLDivElement | null>(null)
  const after = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    controller.start(before.current, after.current)
    return () => controller.stop()
  }, [controller])

  return {
    ...state,
    loadNext: () => controller.loadNext(),
    loadPrevious: () => controller.loadPrevious(),
    before,
    after,
  }
}

const SENTINEL = { height: '1px', margin: 0, padding: 0 }
const VISUALLY_HIDDEN = {
  position: 'absolute' as const,
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap' as const,
}

export type InfiniteScrollContext = Omit<
  UseInfiniteScrollReturn,
  'before' | 'after' | 'announcement'
>

export interface InfiniteScrollProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'>, UseInfiniteScrollOptions {
  data: string
  /** Element rendered around the list (default `div`). */
  as?: string | undefined
  children?: ReactNode | ((scroll: InfiniteScrollContext) => ReactNode)
  /** Manual controls; default a "Load more"/"Load previous" button. */
  next?: ((scroll: InfiniteScrollContext) => ReactNode) | undefined
  previous?: ((scroll: InfiniteScrollContext) => ReactNode) | undefined
  loading?: ((direction: 'next' | 'previous') => ReactNode) | undefined
}

/**
 * Renders a `Bridge::scroll()` list and loads its next (and previous) pages
 * as the user scrolls to its edges (PLAN §13.4).
 */
export function InfiniteScroll({
  data,
  as = 'div',
  buffer,
  manual,
  manualAfter,
  reverse,
  preserveUrl,
  only,
  children,
  next,
  previous,
  loading,
  ...attributes
}: InfiniteScrollProps) {
  const scroll = useInfiniteScroll(data, {
    buffer,
    manual,
    manualAfter,
    reverse,
    preserveUrl,
    only,
  })
  const { before, after, announcement, ...context } = scroll

  const control = (direction: 'next' | 'previous'): ReactNode => {
    const isNext = direction === 'next'
    if (!(isNext ? scroll.hasNext : scroll.hasPrevious)) return null
    if (isNext ? scroll.loadingNext : scroll.loadingPrevious) return loading?.(direction) ?? null
    if (!(isNext ? scroll.manualNext : scroll.manualPrevious)) return null
    const custom = isNext ? next : previous
    if (custom) return custom(context)
    return (
      <button
        type="button"
        data-bridge-scroll={direction}
        onClick={() => void (isNext ? scroll.loadNext() : scroll.loadPrevious())}
      >
        {isNext ? 'Load more' : 'Load previous'}
      </button>
    )
  }

  return createElement(
    as,
    attributes,
    <div ref={before} aria-hidden="true" data-bridge-scroll-edge="before" style={SENTINEL} />,
    control(reverse ? 'next' : 'previous'),
    typeof children === 'function' ? children(context) : children,
    control(reverse ? 'previous' : 'next'),
    <div ref={after} aria-hidden="true" data-bridge-scroll-edge="after" style={SENTINEL} />,
    <div role="status" aria-live="polite" style={VISUALLY_HIDDEN}>
      {announcement}
    </div>,
  )
}
