import type { ReloadOptions } from '@swarakaka/bridge-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBridge } from './context.js'

export interface UsePollOptions {
  /** Start when mounted (default true); otherwise call `start()`. */
  autoStart?: boolean | undefined
  /** Keep polling while the tab is hidden (default false: pause, catch up when visible). */
  keepAlive?: boolean | undefined
}

export interface UsePollReturn {
  start(): void
  stop(): void
  active: boolean
}

/**
 * Reloads the current page every `interval` ms while the component is mounted
 * (PLAN §11.1). It starts in an effect, so server rendering runs no timers, and
 * keeps running across navigations when the component does (a layout).
 * Streams push changes without polling; prefer them where they are deployed.
 */
export function usePoll(
  interval: number,
  reload?: ReloadOptions,
  options: UsePollOptions = {},
): UsePollReturn {
  const bridge = useBridge()
  const [wanted, setWanted] = useState(options.autoStart !== false)
  // The latest reload options, read on every tick without restarting the schedule.
  const latest = useRef(reload)
  latest.current = reload

  useEffect(() => {
    if (!wanted) return
    const handle = bridge.router.poll(interval, () => latest.current ?? {}, {
      keepAlive: options.keepAlive,
      bindToPage: false,
    })
    return () => handle.stop()
  }, [bridge, interval, wanted, options.keepAlive])

  return useMemo(
    () => ({ start: () => setWanted(true), stop: () => setWanted(false), active: wanted }),
    [wanted],
  )
}
