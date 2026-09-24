import type { PollHandle, ReloadOptions } from '@swarakaka/bridge-core'
import {
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { useBridge } from '../injection.js'

export interface UsePollOptions {
  /** Start when mounted (default true); otherwise call `start()`. */
  autoStart?: boolean | undefined
  /** Keep polling while the tab is hidden (default false: pause, catch up when visible). */
  keepAlive?: boolean | undefined
}

export interface UsePollReturn {
  start(): void
  stop(): void
  active: Readonly<Ref<boolean>>
}

/**
 * Reloads the current page every `interval` ms while the component is mounted
 * (PLAN §11.1). It starts after mount, so server rendering runs no timers, and
 * keeps running across navigations when the component does (a layout).
 * Streams push changes without polling; prefer them where they are deployed.
 */
export function usePoll(
  interval: MaybeRefOrGetter<number>,
  reload: MaybeRefOrGetter<ReloadOptions | undefined> = undefined,
  options: UsePollOptions = {},
): UsePollReturn {
  const bridge = useBridge()
  const active = ref(false)
  let handle: PollHandle | null = null
  let wanted = options.autoStart !== false
  let mounted = false

  const sync = (): void => {
    handle?.stop()
    handle = null
    if (mounted && wanted) {
      handle = bridge.router.poll(toValue(interval), () => toValue(reload) ?? {}, {
        keepAlive: options.keepAlive,
        bindToPage: false,
      })
    }
    active.value = handle !== null
  }

  watch(() => toValue(interval), sync)
  onMounted(() => {
    mounted = true
    sync()
  })
  onBeforeUnmount(() => {
    mounted = false
    sync()
  })

  return {
    start() {
      if (wanted && handle) return
      wanted = true
      sync()
    },
    stop() {
      wanted = false
      sync()
    },
    active: readonly(active),
  }
}
