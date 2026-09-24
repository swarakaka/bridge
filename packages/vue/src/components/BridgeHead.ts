import { defineComponent, onBeforeUnmount, watchEffect, type PropType } from 'vue'
import { HEAD_ATTRIBUTE, useHeadContext } from '../head.js'

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

    const original = document.title
    let owned: HTMLMetaElement[] = []

    // Server-rendered tags are recreated below by whichever component declared them.
    document.head.querySelectorAll(`meta[${HEAD_ATTRIBUTE}="ssr"]`).forEach((el) => el.remove())

    watchEffect(() => {
      if (props.title) document.title = props.title
      owned.forEach((el) => el.remove())
      owned = props.meta.map((attributes) => {
        const el = document.createElement('meta')
        for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value)
        el.setAttribute(HEAD_ATTRIBUTE, 'client')
        document.head.appendChild(el)
        return el
      })
    })
    onBeforeUnmount(() => {
      owned.forEach((el) => el.remove())
      owned = []
      if (props.title) document.title = original
    })
    return () => null
  },
})
