import type { JsonHandleOptions, JsonRequest } from '@swarakaka/bridge-core'
import { getCurrentScope, onScopeDispose, reactive, type UnwrapNestedRefs } from 'vue'
import { useBridge } from '../injection.js'

export type ReactiveJsonRequest<T> = UnwrapNestedRefs<JsonRequest<T>>

export interface UseJsonOptions extends JsonHandleOptions {
  /** Abort an in-flight request when the component scope is disposed (default true). */
  cancelOnDispose?: boolean | undefined
}

/**
 * JSON mode from a component: the same routes as page mode, requested with
 * `Accept: application/json`, without navigating. `json.data` holds the last
 * envelope's `data`, `json.errors.email` the first validation message.
 */
export function useJson<T = unknown>(options: UseJsonOptions = {}): ReactiveJsonRequest<T> {
  const bridge = useBridge()
  const { cancelOnDispose, ...handleOptions } = options
  const json = reactive(bridge.jsonRequest<T>(handleOptions)) as ReactiveJsonRequest<T>

  if (cancelOnDispose !== false && getCurrentScope()) {
    onScopeDispose(() => json.cancel())
  }

  return json
}
