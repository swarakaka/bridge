import type { BridgePage } from '@swarakaka/bridge-core'
import { computed, type ComputedRef } from 'vue'
import { useBridge } from '../injection.js'
import { pageStateRef } from '../state.js'

export interface PageRef<P extends Record<string, unknown> = Record<string, unknown>> {
  component: ComputedRef<string>
  url: ComputedRef<string>
  props: ComputedRef<P>
  page: ComputedRef<BridgePage | null>
}

/** Reactive access to the current page. */
export function usePage<P extends Record<string, unknown> = Record<string, unknown>>(): PageRef<P> {
  const state = pageStateRef(useBridge())
  return {
    page: computed(() => state.value.page),
    component: computed(() => state.value.page?.component ?? ''),
    url: computed(() => state.value.page?.url ?? ''),
    props: computed(() => (state.value.page?.props ?? {}) as P),
  }
}

/** Reactive ref to one prop (dot keys allowed). Updated by navigation, partial reloads and streams. */
export function useProp<T = unknown>(key: string, fallback?: T): ComputedRef<T> {
  const state = pageStateRef(useBridge())
  return computed(() => {
    let cursor: unknown = state.value.page?.props
    for (const segment of key.split('.')) {
      if (typeof cursor !== 'object' || cursor === null) return fallback as T
      cursor = (cursor as Record<string, unknown>)[segment]
    }
    return (cursor === undefined ? fallback : cursor) as T
  })
}

/** Loading state and value for a deferred prop. */
export function useDeferred<T = unknown>(
  key: string,
): { loading: ComputedRef<boolean>; value: ComputedRef<T | undefined> } {
  const state = pageStateRef(useBridge())
  return {
    loading: computed(() => state.value.loading.has(key)),
    value: computed(
      () =>
        (state.value.page?.props as Record<string, unknown> | undefined)?.[key] as T | undefined,
    ),
  }
}
