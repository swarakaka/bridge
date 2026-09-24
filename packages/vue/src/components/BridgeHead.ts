import { HeadManager } from '@swarakaka/bridge-core'
import { defineComponent, onBeforeUnmount, watchEffect, type PropType } from 'vue'
import { useHeadContext } from '../head.js'

/**
 * Minimal head management. On the server it records title/meta into the SSR
 * head context. On the client it sets document.title and owns its own
 * <meta> tags, replacing the server-rendered ones on hydration.
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
    if (typeof document === 'undefined') return () => null

    const head = new HeadManager(document)
    watchEffect(() => head.apply({ title: props.title, meta: props.meta }))
    onBeforeUnmount(() => head.dispose())
    return () => null
  },
})
