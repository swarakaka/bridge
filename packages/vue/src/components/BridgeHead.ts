import { defineComponent, onBeforeUnmount, watchEffect } from 'vue'

/** Minimal head management: sets document.title. Extended for SSR in Phase 5. */
export const BridgeHead = defineComponent({
  name: 'BridgeHead',
  props: {
    title: { type: String, default: '' },
  },
  setup(props) {
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
