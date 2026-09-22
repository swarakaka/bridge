import type { Form, FormOptions } from '@swarakaka/bridge-core'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { useCallback, useMemo, useReducer } from 'react'
import { useBridge, usePageState } from './context.js'

export function usePage<P extends Record<string, unknown> = Record<string, unknown>>(): {
  page: BridgePage | null
  component: string
  url: string
  props: P
} {
  const state = usePageState(useBridge())
  const page = state.page
  return {
    page,
    component: page?.component ?? '',
    url: page?.url ?? '',
    props: (page?.props ?? {}) as P,
  }
}

export function useProp<T = unknown>(key: string, fallback?: T): T {
  const { props } = usePage()
  let cursor: unknown = props
  for (const segment of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return fallback as T
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return (cursor === undefined ? fallback : cursor) as T
}

export function useDeferred<T = unknown>(key: string): { loading: boolean; value: T | undefined } {
  const state = usePageState(useBridge())
  return {
    loading: state.loading.has(key),
    value: (state.page?.props as Record<string, unknown> | undefined)?.[key] as T | undefined,
  }
}

/**
 * A core Form re-rendered on every change. Mutations go through the returned
 * proxy so React sees them (`form.setData('name', v)` or `form.data.name = v` followed by `form.refresh()`).
 */
export function useForm<T extends Record<string, unknown>>(
  initial: T,
  options?: FormOptions,
): Form<T> & { refresh(): void } {
  const bridge = useBridge()
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const form = useMemo(() => bridge.form(initial, options), [bridge])
  const refresh = useCallback(() => rerender(), [])

  return useMemo(() => {
    const proxied = new Proxy(form as Form<T> & { refresh(): void }, {
      get(target, prop, receiver) {
        if (prop === 'refresh') return refresh
        const value = Reflect.get(target, prop, receiver)
        if (typeof value === 'function') {
          return (...args: unknown[]) => {
            const result = (value as (...a: unknown[]) => unknown).apply(target, args)
            if (result instanceof Promise) return result.finally(refresh)
            refresh()
            return result
          }
        }
        return value
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value)
        refresh()
        return true
      },
    })
    return proxied
  }, [form, refresh])
}
