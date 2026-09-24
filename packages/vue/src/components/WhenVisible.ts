import type { ReloadOptions } from '@swarakaka/bridge-core'
import { computed, defineComponent, h, ref, type PropType } from 'vue'
import { useWhenVisible } from '../composables/useWhenVisible.js'
import { useBridge } from '../injection.js'
import { pageStateRef } from '../state.js'

/**
 * Loads props when the element approaches the viewport and renders the
 * fallback slot until every listed prop is present (PLAN §13.1). Pair it with
 * `Bridge::lazy()` on the server. The default slot receives `{ loading }`.
 */
export const WhenVisible = defineComponent({
  name: 'WhenVisible',
  props: {
    data: { type: [String, Array] as PropType<string | string[]>, required: true },
    /** Pixels around the viewport that count as visible. */
    buffer: { type: Number, default: 0 },
    /** Reload on every entry into the viewport, not just once. */
    always: { type: Boolean, default: false },
    /** Element rendered around the content and observed. */
    as: { type: String, default: 'div' },
    reload: {
      type: Object as PropType<Omit<ReloadOptions, 'only' | 'except'>>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const state = pageStateRef(useBridge())
    const element = ref<Element | null>(null)
    const keys = computed(() => (Array.isArray(props.data) ? props.data : [props.data]))
    const { loading } = useWhenVisible(element, keys, {
      buffer: () => props.buffer,
      always: () => props.always,
      reload: () => props.reload,
      trackVisibility: false,
    })
    const ready = computed(() => {
      const bag = (state.value.page?.props ?? {}) as Record<string, unknown>
      return keys.value.every((key) => key in bag)
    })
    return () =>
      h(
        props.as,
        { ref: element },
        ready.value ? slots.default?.({ loading: loading.value }) : slots.fallback?.(),
      )
  },
})
