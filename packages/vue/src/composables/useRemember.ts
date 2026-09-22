import { onMounted, ref, watch, type Ref } from 'vue'
import { useBridge } from '../injection.js'

/** Local state that survives back/forward navigation via history state. */
export function useRemember<T>(key: string, initial: T): Ref<T> {
  const bridge = useBridge()
  const value = ref(initial) as Ref<T>
  onMounted(() => {
    const restored = bridge.router.restore<T>(key)
    if (restored !== undefined) value.value = restored
  })
  watch(value, (v) => bridge.router.remember(key, JSON.parse(JSON.stringify(v))), { deep: true })
  return value
}
