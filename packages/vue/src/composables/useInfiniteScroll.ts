import {
  InfiniteScroll,
  type InfiniteScrollOptions,
  type InfiniteScrollState,
} from '@swarakaka/bridge-core'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  type ComponentPublicInstance,
  type ComputedRef,
  type Ref,
} from 'vue'
import { useBridge } from '../injection.js'

export type UseInfiniteScrollOptions = Omit<InfiniteScrollOptions, 'prop' | 'afterRender'>

export interface UseInfiniteScrollReturn {
  hasNext: ComputedRef<boolean>
  hasPrevious: ComputedRef<boolean>
  loadingNext: ComputedRef<boolean>
  loadingPrevious: ComputedRef<boolean>
  manualNext: ComputedRef<boolean>
  manualPrevious: ComputedRef<boolean>
  announcement: ComputedRef<string>
  loadNext(): Promise<void>
  loadPrevious(): Promise<void>
  /** Bind to an element before the items (`ref="before"`): reaching it loads upward. */
  before: Ref<Element | ComponentPublicInstance | null>
  /** Bind to an element after the items: reaching it loads the next page. */
  after: Ref<Element | ComponentPublicInstance | null>
}

/**
 * Infinite scroll for a `Bridge::scroll()` prop with your own markup (PLAN
 * §13.4). Observation starts when mounted, so server rendering loads nothing
 * and reports the manual state.
 */
export function useInfiniteScroll(
  prop: string,
  options: UseInfiniteScrollOptions = {},
): UseInfiniteScrollReturn {
  const bridge = useBridge()
  const win = typeof window === 'undefined' ? null : window
  const controller = new InfiniteScroll(bridge, win, { ...options, prop, afterRender: nextTick })
  const state = shallowRef<InfiniteScrollState>(controller.state)
  const unsubscribe = controller.subscribe((next) => (state.value = next))
  const before = ref<Element | ComponentPublicInstance | null>(null)
  const after = ref<Element | ComponentPublicInstance | null>(null)

  onMounted(() => controller.start(toElement(before.value), toElement(after.value)))
  onBeforeUnmount(() => {
    controller.stop()
    unsubscribe()
  })

  const field = <K extends keyof InfiniteScrollState>(key: K) => computed(() => state.value[key])

  return {
    hasNext: field('hasNext'),
    hasPrevious: field('hasPrevious'),
    loadingNext: field('loadingNext'),
    loadingPrevious: field('loadingPrevious'),
    manualNext: field('manualNext'),
    manualPrevious: field('manualPrevious'),
    announcement: field('announcement'),
    loadNext: () => controller.loadNext(),
    loadPrevious: () => controller.loadPrevious(),
    before,
    after,
  }
}

function toElement(target: Element | ComponentPublicInstance | null): Element | null {
  if (!target) return null
  if (target instanceof Element) return target
  const el = target.$el as unknown
  return el instanceof Element ? el : null
}
