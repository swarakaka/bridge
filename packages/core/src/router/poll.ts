import type { PageStore } from '../pages/PageStore.js'
import type { ReloadOptions, Router } from './Router.js'

export interface PollOptions {
  /** Start at once (default true); otherwise call `start()`. */
  autoStart?: boolean | undefined
  /** Keep polling while the tab is hidden (default false: pause, catch up when visible). */
  keepAlive?: boolean | undefined
  /**
   * Stop when another page instance is shown (default true), so a poll can
   * never reload a page it was not started for. Adapters pass false and stop
   * with the component instead.
   */
  bindToPage?: boolean | undefined
}

export interface PollHandle {
  /** Starts (or restarts) the schedule; the first reload runs one interval later. */
  start(): void
  /** Stops the schedule. Idempotent; a reload in flight still completes. */
  stop(): void
  readonly active: boolean
}

/**
 * Reloads the current page's props every `interval` ms (PLAN §11.1). Each tick
 * is a `router.reload()`, so it coalesces with other reloads and waits behind
 * a user visit; the next tick is scheduled only after the reload settled.
 */
export function createPoll(
  deps: { router: Router; store: PageStore; window: Window | null },
  interval: number,
  reload: ReloadOptions | (() => ReloadOptions) = {},
  options: PollOptions = {},
): PollHandle {
  const { router, store, window: win } = deps
  const doc = win?.document ?? null
  let active = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  // A tick came due while the tab was hidden: reload as soon as it is visible.
  let missed = false
  let cleanups: Array<() => void> = []

  const paused = (): boolean => options.keepAlive !== true && doc?.visibilityState === 'hidden'

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const schedule = (): void => {
    clearTimer()
    if (active) timer = setTimeout(tick, Math.max(0, interval))
  }

  const run = (): void => {
    running = true
    // Background work by default: progress indicators built on `visit.showProgress` stay hidden.
    const reloadOptions = {
      showProgress: false,
      ...(typeof reload === 'function' ? reload() : reload),
    }
    void router.reload(reloadOptions).then(() => {
      running = false
      schedule()
    })
  }

  const tick = (): void => {
    timer = null
    if (!active) return
    if (paused()) {
      missed = true
      return
    }
    run()
  }

  const onVisibilityChange = (): void => {
    if (!active || paused() || !missed || running) return
    missed = false
    clearTimer()
    run()
  }

  const handle: PollHandle = {
    start() {
      handle.stop()
      if (!win) return
      active = true
      missed = false
      doc?.addEventListener('visibilitychange', onVisibilityChange)
      cleanups.push(() => doc?.removeEventListener('visibilitychange', onVisibilityChange))
      if (options.bindToPage !== false) {
        const key = store.current.key
        cleanups.push(
          store.subscribe((state) => {
            if (state.key !== key) handle.stop()
          }),
        )
      }
      schedule()
    },
    stop() {
      active = false
      missed = false
      clearTimer()
      const pending = cleanups
      cleanups = []
      pending.forEach((cleanup) => cleanup())
    },
    get active() {
      return active
    },
  }

  if (options.autoStart !== false) handle.start()
  return handle
}
