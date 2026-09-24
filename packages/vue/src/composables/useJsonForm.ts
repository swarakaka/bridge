import type { JsonForm, JsonFormOptions } from '@swarakaka/bridge-core'
import { getCurrentScope, onScopeDispose } from 'vue'
import { useBridge } from '../injection.js'
import { formArguments, setupForm } from './useForm.js'

/** `useJsonForm`'s return: every `JsonForm` member plus each field at the top level. */
export type ReactiveJsonForm<T extends Record<string, unknown>, R = unknown> = JsonForm<T, R> &
  Omit<T, keyof JsonForm<T, R>>

export interface UseJsonFormOptions extends JsonFormOptions {
  /** Persist the form data in history state under this key (restored on back/forward). */
  remember?: string | undefined
  /** Abort an in-flight request when the component scope is disposed (default true). */
  cancelOnDispose?: boolean | undefined
}

/**
 * A form submitted in JSON mode: the same routes as page mode with
 * `Accept: application/json`, without navigating. Fields, errors, `isDirty`,
 * `reset()`, `validate()`, `remember` and `dontRemember` work as in `useForm`;
 * the last successful response is `form.result` (with `meta`, `httpStatus`),
 * and `form.message` holds the last error message. Fields may not be named
 * like a member (`result`, `meta`, `errors`, ...): `useJsonForm` throws.
 */
export function useJsonForm<T extends Record<string, unknown>, R = unknown>(
  initial: T,
  options?: UseJsonFormOptions,
): ReactiveJsonForm<T, R>
export function useJsonForm<T extends Record<string, unknown>, R = unknown>(
  rememberKey: string,
  initial: T,
  options?: Omit<UseJsonFormOptions, 'remember'>,
): ReactiveJsonForm<T, R>
export function useJsonForm<T extends Record<string, unknown>, R = unknown>(
  first: T | string,
  second?: T | UseJsonFormOptions,
  third?: Omit<UseJsonFormOptions, 'remember'>,
): ReactiveJsonForm<T, R> {
  const [initial, options] = formArguments<T, UseJsonFormOptions>(first, second, third)
  const { remember, cancelOnDispose, ...formOptions } = options
  const bridge = useBridge()
  const form = setupForm(
    'useJsonForm',
    bridge,
    bridge.jsonForm<T, R>(initial, formOptions),
    remember,
  ) as ReactiveJsonForm<T, R>

  if (cancelOnDispose !== false && getCurrentScope()) {
    onScopeDispose(() => form.cancel())
  }

  return form
}
