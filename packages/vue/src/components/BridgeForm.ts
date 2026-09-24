import {
  fileFieldNames,
  readFormElement,
  writeFormElement,
  type Form,
  type FormOptimisticUpdate,
  type FormState,
  type FormTransport,
  type JsonForm,
  type Method,
  type SubmitOptions,
} from '@swarakaka/bridge-core'
import {
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  provide,
  reactive,
  ref,
  watch,
  type InjectionKey,
  type PropType,
  type SlotsType,
} from 'vue'
import { rememberForm } from '../composables/useForm.js'
import { useBridge } from '../injection.js'

export type BridgeFormFields = Record<string, unknown>

/** The form a `<BridgeForm>` hands to its slot, its ref and `useFormContext()`. */
export type BridgeFormInstance<T extends BridgeFormFields = BridgeFormFields> = Form<T> &
  Partial<Pick<JsonForm<T>, 'result' | 'meta' | 'httpStatus' | 'message'>>

/** Visit options a `<BridgeForm>` passes to each submission. */
export type BridgeFormOptions = Pick<
  SubmitOptions,
  | 'preserveScroll'
  | 'preserveState'
  | 'preserveUrl'
  | 'replace'
  | 'only'
  | 'except'
  | 'showProgress'
  | 'queryStringArrayFormat'
  | 'invalidateCacheTags'
>

export const FormContextKey: InjectionKey<BridgeFormInstance> = Symbol('bridge-form')

const EVENTS = [
  ['before', 'onBefore'],
  ['start', 'onStart'],
  ['progress', 'onProgress'],
  ['success', 'onSuccess'],
  ['invalid', 'onInvalid'],
  ['error', 'onError'],
  ['exception', 'onException'],
  ['cancel', 'onCancel'],
  ['finish', 'onFinish'],
] as const

type Callback = (...args: unknown[]) => unknown

/**
 * A form written as plain inputs (PLAN §14.2): values are read from the fields
 * by `name` on every input and on submit, so `isDirty`, `validate`, `remember`
 * and resets work without `v-model`. The slot, a template ref and
 * `useFormContext()` receive the form; `submit()` and `validate(field)` use
 * `action` and `method`.
 */
export const BridgeForm = defineComponent({
  name: 'BridgeForm',
  props: {
    action: { type: String, required: true },
    method: { type: String as PropType<Method>, default: 'post' },
    /** Submit in JSON mode (`useJsonForm`) instead of as a page visit. */
    json: { type: Boolean, default: false },
    transform: {
      type: Function as PropType<(data: BridgeFormFields) => Record<string, unknown>>,
      default: undefined,
    },
    headers: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
    options: { type: Object as PropType<BridgeFormOptions>, default: () => ({}) },
    resetOnSuccess: { type: [Boolean, Array] as PropType<boolean | string[]>, default: false },
    resetOnError: { type: [Boolean, Array] as PropType<boolean | string[]>, default: false },
    setDefaultsOnSuccess: { type: Boolean, default: true },
    disableWhileProcessing: { type: Boolean, default: false },
    cancelOnUnmount: { type: Boolean, default: true },
    validationTimeout: { type: Number, default: undefined },
    validateFiles: { type: Boolean, default: false },
    remember: { type: String, default: undefined },
    /** Page props to show while each submission is in flight, `(props, data) => patch` (PLAN §14.3). */
    optimistic: {
      type: Function as PropType<FormOptimisticUpdate<BridgeFormFields>>,
      default: undefined,
    },
  },
  emits: EVENTS.map(([event]) => event),
  slots: Object as SlotsType<{ default: BridgeFormInstance }>,
  setup(props, { slots, emit, expose }) {
    const bridge = useBridge()
    const instance = (props.json ? bridge.jsonForm({}) : bridge.form({})) as FormState<
      BridgeFormFields,
      FormTransport
    >
    instance.withPrecognition(props.method, props.action)
    if (props.validationTimeout !== undefined)
      instance.setValidationTimeout(props.validationTimeout)
    if (props.validateFiles) instance.validateFiles()
    if (props.transform) instance.transform(props.transform)
    const form = reactive(instance) as unknown as BridgeFormInstance
    const element = ref<HTMLFormElement | null>(null)

    const sync = (): void => {
      if (element.value) form.data = readFormElement(element.value)
    }

    // `submit()` from the slot or a ref carries this component's options and events too.
    const submit = Object.getPrototypeOf(instance).submit as (...args: unknown[]) => unknown
    ;(instance as { submit: unknown }).submit = (
      first?: unknown,
      url?: unknown,
      rest?: unknown,
    ) => {
      sync()
      if (props.optimistic) form.optimistic(props.optimistic)
      return typeof first === 'string' && url !== undefined
        ? submit.call(form, first, url, submitOptions(rest))
        : submit.call(form, submitOptions(first))
    }

    const submitOptions = (given: unknown): Record<string, unknown> => {
      const own = (given ?? {}) as Record<string, unknown>
      const options: Record<string, unknown> = {
        ...props.options,
        resetOnSuccess: props.resetOnSuccess,
        resetOnError: props.resetOnError,
        setDefaultsOnSuccess: props.setDefaultsOnSuccess,
        ...own,
        headers: { ...props.headers, ...((own.headers as Record<string, string>) ?? {}) },
      }
      for (const [event, key] of EVENTS) {
        const callback = own[key] as Callback | undefined
        options[key] = (...args: unknown[]) => {
          emit(event, ...args)
          return callback?.(...args)
        }
      }
      return options
    }

    watch(
      () => [props.method, props.action] as const,
      ([method, action]) => form.withPrecognition(method, action),
    )

    // Values come from the markup: read once mounted, then keep the fields and the form in step.
    let mounted = false
    onMounted(() => {
      mounted = true
      const el = element.value!
      form.data = readFormElement(el)
      form.setDefaults()
      for (const name of fileFieldNames(el)) form.dontRemember(name)
      watch(
        () => form.data,
        (values) => writeFormElement(el, values, 'value'),
        { deep: true },
      )
      watch(
        () => form.defaults,
        (values) => writeFormElement(el, values, 'default'),
        { deep: true },
      )
    })
    // A re-render re-applies `value`/`checked` from the markup to both the property and the
    // attribute (the field's default), so the form's defaults and values are written back.
    onUpdated(() => {
      if (!element.value || !mounted) return
      writeFormElement(element.value, form.defaults, 'default')
      writeFormElement(element.value, form.data, 'value')
    })
    rememberForm(bridge, form, props.remember)

    onBeforeUnmount(() => {
      if (props.cancelOnUnmount) form.cancel()
    })

    provide(FormContextKey, form)
    expose(exposed(form))

    return () =>
      h(
        'form',
        {
          ref: element,
          action: props.action,
          method: props.method === 'get' ? 'get' : 'post',
          inert: props.disableWhileProcessing && form.processing ? true : undefined,
          onSubmit: (event: Event) => {
            event.preventDefault()
            void form.submit()
          },
          onInput: sync,
          onChange: sync,
        },
        slots.default?.(form),
      )
  },
})

/** The enclosing `<BridgeForm>`'s form, or `null` outside one. */
export function useFormContext<
  T extends BridgeFormFields = BridgeFormFields,
>(): BridgeFormInstance<T> | null {
  return inject(FormContextKey, null) as BridgeFormInstance<T> | null
}

/** Getters over every form member, so a template ref reads live state and calls methods. */
function exposed(form: BridgeFormInstance): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const names = new Set<string>()
  for (
    let o: object | null = form;
    o && o !== Object.prototype;
    o = Object.getPrototypeOf(o) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(o)) if (name !== 'constructor') names.add(name)
  }
  for (const name of names) {
    Object.defineProperty(out, name, {
      enumerable: true,
      get: () => {
        const value = (form as unknown as Record<string, unknown>)[name]
        return typeof value === 'function' ? (value as Callback).bind(form) : value
      },
    })
  }
  return out
}
