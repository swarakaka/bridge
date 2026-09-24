import type { Form, FormOptions } from '@swarakaka/bridge-core'
import { onMounted, reactive, watch, type UnwrapNestedRefs } from 'vue'
import { useBridge } from '../injection.js'

/**
 * The form returned by `useForm`: every `Form` member, plus each field as a
 * top-level property (`form.name` is `form.data.name`). Intersecting `Form<T>`
 * itself (not a mapped type) keeps chained methods typed as this form.
 */
export type ReactiveForm<T extends Record<string, unknown>> = Form<T> & Omit<T, keyof Form<T>>

export interface UseFormOptions extends FormOptions {
  /** Persist the form data in history state under this key (restored on back/forward). */
  remember?: string | undefined
}

/**
 * A reactive Form. Fields are read and written directly (`v-model="form.name"`)
 * or through `form.data.name`; both reach the same values, so `isDirty`,
 * `reset()`, submission and `remember` see either style. `form.errors.name`
 * holds the first message. A field may not share a name with a form member
 * (`errors`, `data`, `reset`, ...): `useForm` throws.
 *
 * `useForm('key', data)` is `useForm(data, { remember: 'key' })`; chain
 * `.dontRemember('password')` to keep fields out of history state.
 */
export function useForm<T extends Record<string, unknown>>(
  initial: T,
  options?: UseFormOptions,
): ReactiveForm<T>
export function useForm<T extends Record<string, unknown>>(
  rememberKey: string,
  initial: T,
  options?: Omit<UseFormOptions, 'remember'>,
): ReactiveForm<T>
export function useForm<T extends Record<string, unknown>>(
  first: T | string,
  second?: T | UseFormOptions,
  third?: Omit<UseFormOptions, 'remember'>,
): ReactiveForm<T> {
  const [initial, options] = formArguments<T>(first, second, third)
  const bridge = useBridge()
  const instance = bridge.form(initial, options)
  const members = memberNames(instance)
  for (const field of Object.keys(initial)) {
    if (members.has(field)) {
      throw new Error(
        `[bridge] useForm(): the field "${field}" has the same name as a form member (form.${field}). Rename the field, or nest it under another key and use form.data.`,
      )
    }
  }
  const form = reactive(instance) as UnwrapNestedRefs<Form<T>>
  const flat = flatten(form, members)

  if (options.remember) {
    const key = `form:${options.remember}`
    onMounted(() => {
      const restored = bridge.router.restore<T>(key)
      if (restored) form.setData(form.rememberable(restored))
    })
    watch(
      () => form.data,
      () => bridge.router.remember(key, JSON.parse(JSON.stringify(form.rememberable()))),
      { deep: true },
    )
  }

  return flat as ReactiveForm<T>
}

/** Normalises `(data, options)` and `(rememberKey, data, options)`. */
function formArguments<T extends Record<string, unknown>>(
  first: T | string,
  second?: T | UseFormOptions,
  third?: Omit<UseFormOptions, 'remember'>,
): [T, UseFormOptions] {
  if (typeof first === 'string') return [second as T, { ...third, remember: first }]
  return [first, (second as UseFormOptions | undefined) ?? {}]
}

/** Every property name of the instance and its prototype chain, `Object.prototype` included. */
function memberNames(instance: object): Set<string> {
  const names = new Set<string>()
  for (let o: object | null = instance; o; o = Object.getPrototypeOf(o) as object | null) {
    for (const key of Object.getOwnPropertyNames(o)) names.add(key)
  }
  return names
}

/**
 * Wraps the reactive form so string keys that are not members reach `form.data`.
 * Members go to the reactive form (methods bound to it, and a method returning
 * the form returns this proxy), so Vue tracks reads and triggers writes as before.
 */
function flatten<T extends Record<string, unknown>>(
  form: UnwrapNestedRefs<Form<T>>,
  members: Set<string>,
): object {
  const bound = new Map<PropertyKey, unknown>()
  const data = (): Record<string, unknown> => form.data as Record<string, unknown>
  const isField = (key: PropertyKey): key is string => typeof key === 'string' && !members.has(key)

  const proxy: object = new Proxy(form, {
    get(target, key) {
      if (isField(key) && key in data()) return data()[key]
      const value: unknown = Reflect.get(target, key)
      if (typeof value !== 'function' || !members.has(key as string)) return value
      let fn = bound.get(key)
      if (!fn) {
        const method = value as (...args: unknown[]) => unknown
        fn = (...args: unknown[]) => {
          const result = method.apply(target, args)
          return result === target ? proxy : result
        }
        bound.set(key, fn)
      }
      return fn
    },
    set(target, key, value) {
      if (!isField(key)) return Reflect.set(target, key, value)
      data()[key] = value
      return true
    },
    deleteProperty(target, key) {
      if (!isField(key)) return Reflect.deleteProperty(target, key)
      return Reflect.deleteProperty(data(), key)
    },
    has(target, key) {
      return Reflect.has(target, key) || (isField(key) && key in data())
    },
    ownKeys(target) {
      const keys = Reflect.ownKeys(target)
      for (const key of Reflect.ownKeys(data()))
        if (isField(key) && !keys.includes(key)) keys.push(key)
      return keys
    },
    getOwnPropertyDescriptor(target, key) {
      if (isField(key) && key in data()) {
        return { value: data()[key], writable: true, enumerable: true, configurable: true }
      }
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
  })
  return proxy
}
