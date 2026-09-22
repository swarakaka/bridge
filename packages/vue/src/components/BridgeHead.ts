import { defineComponent, onBeforeUnmount, watchEffect, type PropType } from 'vue'
import { useHeadContext } from '../head.js'

/**
 * Minimal head management: sets document.title on the client and records
 * title/meta into the SSR head context on the server.
 */
export const BridgeHead = defineComponent({
  name: 'BridgeHead',
  props: {
    title: { type: String, default: '' },
    meta: { type: Array as PropType<Array<Record<string, string>>>, default: () => [] },
  },
  setup(props) {
    const server = useHeadContext()
    if (server) {
      if (props.title) server.title = props.title
      server.meta.push(...props.meta)
      return () => null
    }

    const original = typeof document === 'undefined' ? '' : document.title
    watchEffect(() => {
      if (typeof document !== 'undefined' && props.title) document.title = props.title
    })
    onBeforeUnmount(() => {
      if (typeof document !== 'undefined' && !props.title) document.title = original
    })
    return () => null
  },
})
