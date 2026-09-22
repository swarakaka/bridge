import { useStream, type UseStreamReturn } from '@swarakaka/bridge-vue'
import { inject, provide, type InjectionKey } from 'vue'

export const AppStreamKey: InjectionKey<UseStreamReturn> = Symbol('appStream')

/**
 * The layout opens one stream per signed-in user and provides it, so every
 * page (and the Realtime demo) shares a single connection.
 */
export function provideAppStream(): UseStreamReturn {
  const stream = useStream('/events', { autoConnect: true })
  provide(AppStreamKey, stream)
  return stream
}

export function useAppStream(): UseStreamReturn | null {
  return inject(AppStreamKey, null)
}
