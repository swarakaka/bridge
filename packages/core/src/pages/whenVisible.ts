import type { PageStore } from './PageStore.js'
import type { ReloadOptions, Router } from '../router/Router.js'

export interface WhenVisibleOptions {
  /** Top-level prop keys to load, usually `Bridge::lazy()` props. */
  keys: string[]
  /** Start loading this many pixels before the element enters the viewport (default 0). */
  buffer?: number | undefined
  /**
   * Reload on every entry into the viewport. By default loading happens once,
   * and not at all when the keys are already on the page.
   */
  always?: boolean | undefined
  /** Extra reload options (headers, callbacks); `only` is always the keys. */
  reload?: Omit<ReloadOptions, 'only' | 'except'> | undefined
  /** Called whenever the element enters or leaves the (buffered) viewport. */
  onVisibilityChange?: ((visible: boolean) => void) | undefined
}

export interface WhenVisibleHandle {
  /** True while a load started by this handle is in flight. */
  readonly loading: boolean
  /** Stops observing; an in-flight load still completes. */
  stop(): void
}

/**
 * Loads props when an element approaches the viewport (PLAN §13.1): an
 * `IntersectionObserver` triggers `router.reload({ only: keys })`, so loads
 * coalesce with other reloads, wait behind a user visit and are dropped when
 * the page changed. The keys are marked loading in the store, like deferred
 * groups. Without `IntersectionObserver` the keys load at once.
 */
export function loadWhenVisible(
  bridge: { router: Router; store: PageStore },
  element: Element,
  options: WhenVisibleOptions,
): WhenVisibleHandle {
  const { router, store } = bridge
  const keys = options.keys
  const win = element.ownerDocument.defaultView
  let observer: IntersectionObserver | null = null
  let loading = false
  // No more loads: loaded once, stopped, or the keys were there from the start.
  let done = false

  const missing = (): boolean => {
    const props = (store.page?.props ?? {}) as Record<string, unknown>
    return keys.some((key) => !(key in props))
  }

  const finish = (): void => {
    done = true
    // Keep observing only for someone who wants to know about visibility.
    if (!options.onVisibilityChange) {
      observer?.disconnect()
      observer = null
    }
  }

  const load = (): void => {
    if (loading || done || keys.length === 0) return
    if (!options.always && !missing()) {
      finish()
      return
    }
    loading = true
    store.setLoading(keys, true)
    void router.reload({ ...options.reload, only: keys }).then((outcome) => {
      loading = false
      store.setLoading(keys, false)
      if (!options.always && outcome.status === 'success' && !missing()) finish()
    })
  }

  if (!options.always && !missing()) done = true

  if (win && typeof win.IntersectionObserver === 'function') {
    if (!done || options.onVisibilityChange) {
      observer = new win.IntersectionObserver(
        (entries) => {
          const visible = entries.some((entry) => entry.isIntersecting)
          options.onVisibilityChange?.(visible)
          if (visible) load()
        },
        { rootMargin: `${options.buffer ?? 0}px` },
      )
      observer.observe(element)
    }
  } else {
    // No observer (old browsers, some test environments): behave like a deferred prop.
    load()
  }

  return {
    get loading() {
      return loading
    },
    stop() {
      done = true
      observer?.disconnect()
      observer = null
    },
  }
}
