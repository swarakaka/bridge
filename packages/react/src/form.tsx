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
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from 'react'
import { useBridge } from './context.js'
import { QUIET_FORM_METHODS, useFormRemember, useHandle } from './hooks.js'

export type BridgeFormFields = Record<string, unknown>

/** The form a `<BridgeForm>` passes to its children function, its ref and `useFormContext()`. */
export type BridgeFormInstance<T extends BridgeFormFields = BridgeFormFields> = Form<T> &
  Partial<Pick<JsonForm<T>, 'result' | 'meta' | 'httpStatus' | 'message'>> & { refresh(): void }

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

/** A submission callback; its arguments depend on page or JSON mode (see the visit and `useJsonForm` callbacks). */
type Callback = (...args: never[]) => unknown

const CALLBACKS = [
  'onBefore',
  'onStart',
  'onProgress',
  'onSuccess',
  'onInvalid',
  'onError',
  'onException',
  'onCancel',
  'onFinish',
] as const

type CallbackProps = Partial<Record<(typeof CALLBACKS)[number], Callback>>

export interface BridgeFormProps
  extends
    Omit<
      FormHTMLAttributes<HTMLFormElement>,
      'action' | 'method' | 'children' | (typeof CALLBACKS)[number]
    >,
    CallbackProps {
  action: string
  method?: Method
  /** Submit in JSON mode (`useJsonForm`) instead of as a page visit. */
  json?: boolean
  transform?: (data: BridgeFormFields) => Record<string, unknown>
  headers?: Record<string, string>
  options?: BridgeFormOptions
  resetOnSuccess?: boolean | string[]
  resetOnError?: boolean | string[]
  /** After a success, make the submitted values the new defaults (default true). */
  setDefaultsOnSuccess?: boolean
  disableWhileProcessing?: boolean
  /** Abort an in-flight submission on unmount (default true). */
  cancelOnUnmount?: boolean
  validationTimeout?: number
  validateFiles?: boolean
  remember?: string
  /** Page props to show while each submission is in flight, `(props, data) => patch` (PLAN §14.3). */
  optimistic?: FormOptimisticUpdate<BridgeFormFields>
  children?: ReactNode | ((form: BridgeFormInstance) => ReactNode)
}

// A fresh `{ form }` per render: the form object is stable, so consumers re-render through this.
const FormContext = createContext<{ form: BridgeFormInstance } | null>(null)

/** The enclosing `<BridgeForm>`'s form, or `null` outside one. */
export function useFormContext<
  T extends BridgeFormFields = BridgeFormFields,
>(): BridgeFormInstance<T> | null {
  return (useContext(FormContext)?.form ?? null) as BridgeFormInstance<T> | null
}

/**
 * A form written as uncontrolled inputs (PLAN §14.2): values are read from the
 * fields by `name` on every change and on submit, so `isDirty`, `validate`,
 * `remember` and resets work without state per field. Give inputs
 * `defaultValue`/`defaultChecked`. Children may be a function of the form; a
 * ref and `useFormContext()` receive the same form.
 */
export const BridgeForm = forwardRef<BridgeFormInstance, BridgeFormProps>(
  function BridgeForm(props, ref) {
    const {
      action,
      method = 'post',
      json = false,
      transform,
      headers: _headers,
      options: _options,
      resetOnSuccess: _resetOnSuccess,
      resetOnError: _resetOnError,
      setDefaultsOnSuccess: _setDefaultsOnSuccess,
      disableWhileProcessing = false,
      cancelOnUnmount: _cancelOnUnmount,
      validationTimeout,
      validateFiles = false,
      remember,
      optimistic: _optimistic,
      children,
      ...rest
    } = props // the `_` props are read at submit time through `latest`
    const attributes = Object.fromEntries(
      Object.entries(rest).filter(([key]) => !(CALLBACKS as readonly string[]).includes(key)),
    )
    const bridge = useBridge()
    const element = useRef<HTMLFormElement>(null)
    const latest = useRef(props)
    latest.current = props
    const captured = useRef(false)

    const form = useHandle(() => {
      const instance = (json ? bridge.jsonForm({}) : bridge.form({})) as FormState<
        BridgeFormFields,
        FormTransport
      >
      instance.withPrecognition(method, action)
      if (validationTimeout !== undefined) instance.setValidationTimeout(validationTimeout)
      if (validateFiles) instance.validateFiles()
      if (transform) instance.transform(transform)
      // `submit()` from the children function or a ref carries this component's options too.
      const submit = Object.getPrototypeOf(instance).submit as (...args: unknown[]) => unknown
      ;(instance as { submit: unknown }).submit = (
        first?: unknown,
        url?: unknown,
        own?: unknown,
      ) => {
        if (element.current) instance.data = readFormElement(element.current)
        if (latest.current.optimistic) instance.optimistic(latest.current.optimistic)
        return typeof first === 'string' && url !== undefined
          ? submit.call(instance, first, url, submitOptions(latest.current, own))
          : submit.call(instance, submitOptions(latest.current, first))
      }
      return instance
    }, QUIET_FORM_METHODS) as unknown as BridgeFormInstance

    // Values come from the markup: read once mounted, before `remember` restores.
    useEffect(() => {
      const el = element.current!
      form.data = readFormElement(el)
      form.setDefaults()
      for (const name of fileFieldNames(el)) form.dontRemember(name)
      captured.current = true
    }, [])
    useFormRemember(form, remember)

    // Keep the fields in step with the form (resets, restored values, new defaults).
    useEffect(() => {
      if (!captured.current || !element.current) return
      writeFormElement(element.current, form.defaults, 'default')
      writeFormElement(element.current, form.data, 'value')
    })

    useEffect(() => {
      form.withPrecognition(method, action)
    }, [method, action])

    useEffect(
      () => () => {
        if (latest.current.cancelOnUnmount !== false) form.cancel()
      },
      [form],
    )

    useImperativeHandle(ref, () => form, [form])

    const sync = (): void => {
      if (element.current) form.data = readFormElement(element.current)
    }

    return (
      <FormContext.Provider value={{ form }}>
        <form
          {...attributes}
          ref={element}
          action={action}
          method={method === 'get' ? 'get' : 'post'}
          inert={disableWhileProcessing && form.processing ? true : undefined}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            void form.submit()
          }}
          onChange={sync}
        >
          {typeof children === 'function' ? children(form) : children}
        </form>
      </FormContext.Provider>
    )
  },
)

function submitOptions(props: BridgeFormProps, given: unknown): Record<string, unknown> {
  const own = (given ?? {}) as Record<string, unknown>
  const options: Record<string, unknown> = {
    ...props.options,
    resetOnSuccess: props.resetOnSuccess ?? false,
    resetOnError: props.resetOnError ?? false,
    setDefaultsOnSuccess: props.setDefaultsOnSuccess ?? true,
    ...own,
    headers: { ...(props.headers ?? {}), ...((own.headers as Record<string, string>) ?? {}) },
  }
  for (const key of CALLBACKS) {
    const fromProps = props[key] as ((...args: unknown[]) => unknown) | undefined
    const fromCall = own[key] as ((...args: unknown[]) => unknown) | undefined
    if (!fromProps && !fromCall) continue
    options[key] = (...args: unknown[]) => {
      const before = fromProps?.(...args)
      const result = fromCall?.(...args)
      return before === false || result === false ? false : result
    }
  }
  return options
}
