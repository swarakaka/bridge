import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import { useInfiniteScroll } from '../composables/useInfiniteScroll.js'

/** An invisible edge the observer watches. */
const SENTINEL = { height: '1px', margin: '0', padding: '0' }
/** Hidden from sight, read by assistive technology. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

/**
 * Renders a `Bridge::scroll()` list and loads its next (and previous) pages
 * as the user scrolls to its edges (PLAN §13.4). Slots: default (the items),
 * `next`/`previous` (manual controls, default a button), `loading`
 * (`{ direction }`). Each slot receives the scroll state and `loadNext`/`loadPrevious`.
 */
export const InfiniteScroll = defineComponent({
  name: 'InfiniteScroll',
  props: {
    data: { type: String, required: true },
    buffer: { type: Number, default: 500 },
    manual: { type: Boolean, default: false },
    manualAfter: { type: Number, default: undefined },
    reverse: { type: Boolean, default: false },
    preserveUrl: { type: Boolean, default: false },
    only: { type: Array as PropType<string[]>, default: () => [] },
    as: { type: String, default: 'div' },
  },
  setup(props, { slots }) {
    const scroll = useInfiniteScroll(props.data, {
      buffer: props.buffer,
      manual: props.manual,
      manualAfter: props.manualAfter,
      reverse: props.reverse,
      preserveUrl: props.preserveUrl,
      only: props.only,
    })

    const context = () => ({
      hasNext: scroll.hasNext.value,
      hasPrevious: scroll.hasPrevious.value,
      loadingNext: scroll.loadingNext.value,
      loadingPrevious: scroll.loadingPrevious.value,
      manualNext: scroll.manualNext.value,
      manualPrevious: scroll.manualPrevious.value,
      loadNext: scroll.loadNext,
      loadPrevious: scroll.loadPrevious,
    })

    const control = (direction: 'next' | 'previous'): VNodeChild => {
      const next = direction === 'next'
      if (!(next ? scroll.hasNext.value : scroll.hasPrevious.value)) return null
      if (next ? scroll.loadingNext.value : scroll.loadingPrevious.value)
        return slots.loading?.({ direction }) ?? null
      if (!(next ? scroll.manualNext.value : scroll.manualPrevious.value)) return null
      const slot = next ? slots.next : slots.previous
      if (slot) return slot(context())
      return h(
        'button',
        {
          type: 'button',
          'data-bridge-scroll': direction,
          onClick: () => void (next ? scroll.loadNext() : scroll.loadPrevious()),
        },
        next ? 'Load more' : 'Load previous',
      )
    }

    return () => {
      // In reverse mode the next page belongs at the top.
      const top = props.reverse ? 'next' : 'previous'
      const bottom = props.reverse ? 'previous' : 'next'
      return h(props.as, [
        h('div', {
          ref: scroll.before,
          'aria-hidden': 'true',
          'data-bridge-scroll-edge': 'before',
          style: SENTINEL,
        }),
        control(top),
        slots.default?.(context()),
        control(bottom),
        h('div', {
          ref: scroll.after,
          'aria-hidden': 'true',
          'data-bridge-scroll-edge': 'after',
          style: SENTINEL,
        }),
        h(
          'div',
          { role: 'status', 'aria-live': 'polite', style: VISUALLY_HIDDEN },
          scroll.announcement.value,
        ),
      ])
    }
  },
})
