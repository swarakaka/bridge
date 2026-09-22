import { computed, defineComponent, type PropType } from 'vue'
import { useBridge } from '../injection.js'
import { pageStateRef } from '../state.js'

/** Renders the fallback slot until every listed prop is present on the page. */
export const Deferred = defineComponent({
  name: 'Deferred',
  props: {
    data: { type: [String, Array] as PropType<string | string[]>, required: true },
  },
  setup(props, { slots }) {
    const state = pageStateRef(useBridge())
    const keys = computed(() => (Array.isArray(props.data) ? props.data : [props.data]))
    const ready = computed(() => {
      const propsBag = state.value.page?.props ?? {}
      return keys.value.every((key) => key in propsBag)
    })
    return () => (ready.value ? slots.default?.() : slots.fallback?.())
  },
})
