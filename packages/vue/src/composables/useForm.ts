import type { Form, FormOptions } from '@swarakaka/bridge-core'
import { onMounted, reactive, watch, type UnwrapNestedRefs } from 'vue'
import { useBridge } from '../injection.js'

export type ReactiveForm<T extends Record<string, unknown>> = UnwrapNestedRefs<Form<T>>

export interface UseFormOptions extends FormOptions {
  /** Persist the form data in history state under this key (restored on back/forward). */
  remember?: string | undefined
}

/**
 * A reactive Form. Methods mutate through the proxy so templates update.
 * `form.data.name` holds the values; `form.errors.name` the first message.
 */
export function useForm<T extends Record<string, unknown>>(
  initial: T,
  options: UseFormOptions = {},
): ReactiveForm<T> {
  const bridge = useBridge()
  const form = reactive(bridge.form(initial, options)) as ReactiveForm<T>

  if (options.remember) {
    const key = `form:${options.remember}`
    onMounted(() => {
      const restored = bridge.router.restore<T>(key)
      if (restored) form.setData(restored as Partial<T>)
    })
    watch(
      () => form.data,
      (data) => bridge.router.remember(key, JSON.parse(JSON.stringify(data))),
      { deep: true },
    )
  }

  return form
}
