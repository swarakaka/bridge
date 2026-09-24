import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useBridge } from '../injection.js'

/** Local state that survives back/forward navigation via history state. */
export function useRemember<T>(key: string, initial: T): Ref<T> {
  const bridge = useBridge()
  const value = ref(initial) as Ref<T>
  // The value last taken from history (or the initial one): anything else is the user's.
  let baseline = JSON.stringify(initial)
  let off: (() => void) | null = null
  const apply = (restored: T | undefined): void => {
    if (restored === undefined) return
    baseline = JSON.stringify(restored)
    value.value = restored
  }

  onMounted(() => {
    apply(bridge.router.restore<T>(key))
    // Encrypted pages: after a full reload the state arrives once decrypted (PLAN §23.1).
    off = bridge.on('restore', ({ values }) => {
      if (key in values && JSON.stringify(value.value) === baseline) apply(values[key] as T)
    })
  })
  onBeforeUnmount(() => off?.())
  watch(value, (v) => bridge.router.remember(key, JSON.parse(JSON.stringify(v))), { deep: true })
  return value
}
