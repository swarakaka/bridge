import { loadWhenVisible, type ReloadOptions, type WhenVisibleHandle } from '@swarakaka/bridge-core'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toValue,
  watch,
  type ComponentPublicInstance,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { useBridge } from '../injection.js'
import { pageStateRef } from '../state.js'

export interface UseWhenVisibleOptions {
  /** Start loading this many pixels before the element enters the viewport. */
  buffer?: MaybeRefOrGetter<number | undefined>
  /** Reload on every entry into the viewport instead of once. */
  always?: MaybeRefOrGetter<boolean | undefined>
  /** Extra reload options (headers, callbacks); `only` is always the keys. */
  reload?: MaybeRefOrGetter<Omit<ReloadOptions, 'only' | 'except'> | undefined>
  /**
   * Keep `visible` up to date after the props loaded (default true). `false`
   * disconnects the observer once there is nothing left to load.
   */
  trackVisibility?: boolean | undefined
}

type Target = Element | ComponentPublicInstance | null | undefined

/**
 * Loads props when `target` approaches the viewport (PLAN §13.1). `visible`
 * follows the element; `loading` is true while any of the keys is loading.
 * Nothing runs during server rendering: observation starts once mounted.
 */
export function useWhenVisible(
  target: MaybeRefOrGetter<Target>,
  keys: MaybeRefOrGetter<string | string[]>,
  options: UseWhenVisibleOptions = {},
): { visible: Ref<boolean>; loading: ComputedRef<boolean> } {
  const bridge = useBridge()
  const state = pageStateRef(bridge)
  const visible = ref(false)
  const keyList = computed(() => {
    const value = toValue(keys)
    return Array.isArray(value) ? value : [value]
  })
  const loading = computed(() => keyList.value.some((key) => state.value.loading.has(key)))
  let handle: WhenVisibleHandle | null = null
  let started: { element: Element; config: string } | null = null
  let mounted = false

  const start = (): void => {
    const element = mounted ? toElement(toValue(target)) : null
    const buffer = toValue(options.buffer)
    const always = toValue(options.always)
    const config = `${keyList.value.join(',')}|${String(buffer)}|${String(always)}`
    if (element && started?.element === element && started.config === config) return
    handle?.stop()
    handle = null
    started = null
    if (!element) return
    started = { element, config }
    handle = loadWhenVisible(bridge, element, {
      keys: keyList.value,
      buffer,
      always,
      reload: toValue(options.reload),
      onVisibilityChange:
        options.trackVisibility === false ? undefined : (value) => (visible.value = value),
    })
  }

  watch(
    [
      () => toElement(toValue(target)),
      () => keyList.value.join(','),
      () => toValue(options.buffer),
      () => toValue(options.always),
    ],
    start,
    { flush: 'post' },
  )
  onMounted(() => {
    mounted = true
    start()
  })
  onBeforeUnmount(() => {
    mounted = false
    handle?.stop()
    handle = null
    started = null
  })

  return { visible, loading }
}

function toElement(target: Target): Element | null {
  if (!target) return null
  if (target instanceof Element) return target
  const el = (target as ComponentPublicInstance).$el as unknown
  return el instanceof Element ? el : null
}
