import type { Bridge, PageState } from '@swarakaka/bridge-core'
import { shallowRef, type ShallowRef } from 'vue'

/** One reactive mirror of the PageStore per Bridge instance. */
const mirrors = new WeakMap<Bridge, ShallowRef<PageState>>()

export function pageStateRef(bridge: Bridge): ShallowRef<PageState> {
  let ref = mirrors.get(bridge)
  if (!ref) {
    ref = shallowRef(bridge.store.current)
    const target = ref
    bridge.store.subscribe((state) => {
      target.value = state
    })
    mirrors.set(bridge, ref)
  }
  return ref
}
