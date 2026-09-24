import { hasFiles } from '../http/formData.js'
import type { UploadProgress } from '../http/RequestManager.js'
import type { Method } from '../router/url.js'
import type { ValidationErrors } from '../router/Visit.js'

export type FormData_ = Record<string, unknown>

/** What a submission does to the values afterwards; per form (`FormOptions`) or per submit. */
export interface SubmitResetOptions {
  /** Reset to defaults after a success: `true` for every field, or a list of fields. */
  resetOnSuccess?: boolean | string[] | undefined
  /** Reset after a validation error or other error response: `true` or a list of fields. */
  resetOnError?: boolean | string[] | undefined
  /** After a success, make the submitted values the new defaults (default `true`). */
  setDefaultsOnSuccess?: boolean | undefined
}

export interface FormOptions extends SubmitResetOptions {
  /** How long `recentlySuccessful` stays true, in ms. */
  recentlySuccessfulFor?: number | undefined
}

/** `form.optimistic(fn)`: the page props to show while the submission is in flight. */
export type FormOptimisticUpdate<T> = (
  props: Record<string, unknown>,
  data: T,
) => Record<string, unknown>

/** The types a transport plugs into `FormState` (PLAN §14.1). */
export interface FormTransport {
  /** Options of `submit` and the verb helpers. */
  submitOptions: object
  /** What `submit` and `validate` resolve to; includes `{ status: 'cancelled' }`. */
  outcome: { status: string }
  /** `lastError` and the argument of `onError`. */
  error: unknown
  /** Second argument of `onInvalid`. */
  invalid: unknown
}

export interface FormValidateOptions<K extends FormTransport> {
  headers?: Record<string, string> | undefined
  /** Fields to validate (the bound-endpoint style; same as passing them first). */
  only?: string[] | undefined
  /** Return `false` to skip the request. */
  onBefore?: (() => boolean | void) | undefined
  onInvalid?: ((errors: ValidationErrors, detail: K['invalid']) => void) | undefined
  onError?: ((error: K['error']) => void) | undefined
  onSuccess?: (() => void) | undefined
  onFinish?: (() => void) | undefined
}

/** A transport's answer to a Precognition request, as `validate()` needs it. */
export type PrecognitionResult<K extends FormTransport> =
  | { kind: 'invalid'; errors: ValidationErrors; detail: K['invalid']; outcome: K['outcome'] }
  | { kind: 'error'; error: K['error']; outcome: K['outcome'] }
  | { kind: 'passed'; outcome: K['outcome'] }
  | { kind: 'unexpected'; got: string }
  | { kind: 'cancelled' }

/**
 * Field state shared by every form (PLAN §14, §14.1, §15): values, defaults,
 * errors, submission flags and Precognition. Subclasses supply the transport
 * (`submitTo`, `cancel`, `precognition`). Framework adapters wrap instances in
 * their reactivity system; all mutations go through `this` so proxies work.
 */
export abstract class FormState<T extends FormData_, K extends FormTransport> {
  data: T
  defaults: T
  /** First message per field. */
  errors: Record<string, string> = {}
  /** All messages per field, as the server sent them. */
  allErrors: ValidationErrors = {}
  processing = false
  progress: UploadProgress | null = null
  wasSuccessful = false
  recentlySuccessful = false
  lastError: K['error'] | null = null
  validating = false

  protected transformer: (data: T) => Record<string, unknown> = (data) => data
  protected readonly options: FormOptions
  private recentlyTimer: ReturnType<typeof setTimeout> | null = null
  private readonly unremembered = new Set<string>()
  private validation: AbortController | null = null
  private optimisticUpdate: FormOptimisticUpdate<T> | null = null
  /** Precognition state, in one member so it reserves one Vue field name (§15). */
  private readonly precog: PrecognitionState<K> = {
    endpoint: null,
    touched: new Set(),
    validated: new Set(),
    timeout: 1500,
    files: false,
    timer: null,
    pending: null,
  }

  constructor(initial: T, options: FormOptions = {}) {
    this.data = clone(initial)
    this.defaults = clone(initial)
    this.options = options
  }

  /** Sends the form with this transport. */
  protected abstract submitTo(
    method: Method,
    url: string | URL,
    options?: K['submitOptions'],
  ): Promise<K['outcome']>

  /** Abort the in-flight submission, if any. */
  abstract cancel(): void

  /** Sends one Precognition request (headers already set) and classifies the answer. */
  protected abstract precognition(
    method: Method,
    url: string | URL,
    data: Record<string, unknown>,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<PrecognitionResult<K>>

  /** Records the detail of a Precognition 422 (`lastError`, `message`, ...). */
  protected abstract recordInvalid(detail: K['invalid']): void

  protected recordError(error: K['error']): void {
    this.lastError = error
  }

  /**
   * Submit to the given endpoint, or with no method and URL to the one bound
   * by `withPrecognition` (or `useForm(method, url, data)`).
   */
  submit(options?: K['submitOptions']): Promise<K['outcome']>
  submit(method: Method, url: string | URL, options?: K['submitOptions']): Promise<K['outcome']>
  submit(
    methodOrOptions?: Method | K['submitOptions'],
    url?: string | URL,
    options?: K['submitOptions'],
  ): Promise<K['outcome']> {
    if (typeof methodOrOptions === 'string' && url !== undefined) {
      return this.submitTo(methodOrOptions, url, options)
    }
    const endpoint = this.endpoint('submit')
    return this.submitTo(endpoint.method, endpoint.url, methodOrOptions as K['submitOptions'])
  }

  /**
   * An optimistic update for the next submission only: `fn(props, data)`
   * returns the top-level page props to show until the server answers, undone
   * if it refuses (PLAN §14.3).
   */
  optimistic(update: FormOptimisticUpdate<T>): this {
    this.optimisticUpdate = update
    return this
  }

  /** The pending `optimistic()` update as a visit-style `(props) => patch`, consumed. */
  protected takeOptimistic():
    ((props: Record<string, unknown>) => Record<string, unknown>) | undefined {
    const update = this.optimisticUpdate
    if (!update) return undefined
    this.optimisticUpdate = null
    const data = this.data
    return (props) => update(props, data)
  }

  /** Bind the endpoint used by `validate(field)` and `submit()` without a method and URL. */
  withPrecognition(method: Method, url: string | URL): this {
    this.precog.endpoint = { method, url }
    return this
  }

  /** Debounce for `validate(field)` in ms (default 1500; 0 sends every call at once). */
  setValidationTimeout(ms: number): this {
    this.precog.timeout = ms
    return this
  }

  /** Send files with `validate(field)` requests; by default they are left out. */
  validateFiles(): this {
    this.precog.files = true
    return this
  }

  /** Mark fields as touched without validating; with no arguments, every top-level field. */
  touch(...fields: Array<string | string[]>): this {
    const list = fields.flat()
    for (const field of list.length > 0 ? list : Object.keys(this.data))
      this.precog.touched.add(field)
    return this
  }

  /** Whether the field was touched; with no argument, whether any field was. */
  touched(field?: string): boolean {
    return field === undefined ? this.precog.touched.size > 0 : this.precog.touched.has(field)
  }

  /** The field was validated through Precognition and has no error. */
  valid(field: string): boolean {
    return this.precog.validated.has(field) && !Object.hasOwn(this.errors, field)
  }

  /** The field has an error. */
  invalid(field: string): boolean {
    return Object.hasOwn(this.errors, field)
  }

  get isDirty(): boolean {
    return JSON.stringify(this.data) !== JSON.stringify(this.defaults)
  }

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0
  }

  get(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submitTo('get', url, options)
  }

  post(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submitTo('post', url, options)
  }

  put(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submitTo('put', url, options)
  }

  patch(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submitTo('patch', url, options)
  }

  delete(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submitTo('delete', url, options)
  }

  /**
   * Merge values, set one field, or merge what a callback returns from the
   * current data (`setData((data) => ({ ...data, name: 'x' }))`).
   */
  setData(values: Partial<T>): this
  setData(update: (data: T) => Partial<T>): this
  setData<F extends keyof T>(key: F, value: T[F]): this
  setData(keyOrValues: keyof T | Partial<T> | ((data: T) => Partial<T>), value?: unknown): this {
    if (typeof keyOrValues === 'function') Object.assign(this.data, keyOrValues(this.data))
    else if (typeof keyOrValues === 'object') Object.assign(this.data, keyOrValues)
    else (this.data as Record<string, unknown>)[keyOrValues as string] = value
    return this
  }

  transform(fn: (data: T) => Record<string, unknown>): this {
    this.transformer = fn
    return this
  }

  setDefaults(values?: Partial<T>): this {
    this.defaults = values ? { ...clone(this.data), ...values } : clone(this.data)
    return this
  }

  /** Restore defaults; touched and validated state is forgotten for the same fields. */
  reset(...fields: Array<keyof T & string>): this {
    if (fields.length === 0) {
      this.data = clone(this.defaults)
      this.precog.touched.clear()
      this.precog.validated.clear()
    } else {
      for (const field of fields) {
        ;(this.data as Record<string, unknown>)[field] = clone(this.defaults[field])
        this.precog.touched.delete(field)
        this.precog.validated.delete(field)
      }
    }
    return this
  }

  /** `reset(...fields)` and `clearErrors(...fields)` together. */
  resetAndClearErrors(...fields: Array<keyof T & string>): this {
    this.reset(...fields)
    return this.clearErrors(...fields)
  }

  /**
   * Keep these top-level fields (passwords, tokens) out of remembered history
   * state. Chainable after the adapter's `useForm`; idempotent.
   */
  dontRemember(...fields: Array<keyof T & string>): this {
    for (const field of fields) this.unremembered.add(field)
    return this
  }

  /** `values` (default: the current data) without the fields passed to `dontRemember`. */
  rememberable(values: Partial<T> = this.data): Partial<T> {
    if (this.unremembered.size === 0) return values
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values)) {
      if (!this.unremembered.has(key)) out[key] = value
    }
    return out as Partial<T>
  }

  setError(field: keyof T & string, message: string): this
  setError(errors: Record<string, string | string[]>): this
  setError(fieldOrErrors: string | Record<string, string | string[]>, message?: string): this {
    if (typeof fieldOrErrors === 'string') {
      this.errors = { ...this.errors, [fieldOrErrors]: message ?? '' }
      this.allErrors = { ...this.allErrors, [fieldOrErrors]: [message ?? ''] }
    } else {
      const flat: Record<string, string> = {}
      const all: ValidationErrors = {}
      for (const [key, value] of Object.entries(fieldOrErrors)) {
        const list = Array.isArray(value) ? value : [value]
        flat[key] = list[0] ?? ''
        all[key] = list
      }
      this.errors = { ...this.errors, ...flat }
      this.allErrors = { ...this.allErrors, ...all }
    }
    return this
  }

  clearErrors(...fields: string[]): this {
    if (fields.length === 0) {
      this.errors = {}
      this.allErrors = {}
      return this
    }
    const errors = { ...this.errors }
    const all = { ...this.allErrors }
    for (const field of fields) {
      delete errors[field]
      delete all[field]
    }
    this.errors = errors
    this.allErrors = all
    return this
  }

  /**
   * Validate through Laravel Precognition without running the controller;
   * the route needs the `precognitive` middleware. Only the validated fields'
   * errors change, and a 204 clears them.
   *
   * - `validate(field | fields, options?)`, `validate({ only, ...options })`,
   *   `validate()`: against the bound endpoint (`withPrecognition`). No fields
   *   means the touched ones. Debounced (`setValidationTimeout`): the first
   *   call is sent at once, later calls within the window are combined into
   *   one request. Files are left out unless `validateFiles()` was called.
   * - `validate(method, url, fields?, options?)`: that endpoint, sent at once
   *   with the whole data; no fields validates every rule.
   *
   * Runs beside submissions: it never cancels one, and a newer request
   * supersedes an older one still in flight.
   */
  validate(
    fields?: string | string[] | FormValidateOptions<K>,
    options?: FormValidateOptions<K>,
  ): Promise<K['outcome']>
  validate(
    method: Method,
    url: string | URL,
    fields?: string | string[],
    options?: FormValidateOptions<K>,
  ): Promise<K['outcome']>
  validate(
    first?: string | string[] | FormValidateOptions<K>,
    second?: string | URL | FormValidateOptions<K>,
    third?: string | string[],
    fourth?: FormValidateOptions<K>,
  ): Promise<K['outcome']> {
    if (typeof first === 'string' && (typeof second === 'string' || second instanceof URL)) {
      const fields = third === undefined ? [] : Array.isArray(third) ? third : [third]
      return this.precognize(first as Method, second, fields, fourth ?? {}, true)
    }
    const options = (
      typeof first === 'object' && !Array.isArray(first) ? first : (second ?? {})
    ) as FormValidateOptions<K>
    const explicit =
      typeof first === 'string' ? [first] : Array.isArray(first) ? first : (options.only ?? null)
    this.endpoint('validate')
    return this.debounced(explicit, options)
  }

  private endpoint(action: string): { method: Method; url: string | URL } {
    const endpoint = this.precog.endpoint
    if (!endpoint) {
      throw new Error(
        `[bridge] form.${action}() without a method and URL needs an endpoint: create the form with (method, url, data) or call form.withPrecognition(method, url).`,
      )
    }
    return endpoint
  }

  /** Leading call at once, then one combined trailing request per window. */
  private debounced(
    fields: string[] | null,
    options: FormValidateOptions<K>,
  ): Promise<K['outcome']> {
    const state = this.precog
    if (state.timeout <= 0) return this.validateBound(fields ?? null, options)
    if (state.timer === null) {
      state.timer = setTimeout(() => this.flushValidation(), state.timeout)
      return this.validateBound(fields, options)
    }
    clearTimeout(state.timer)
    state.timer = setTimeout(() => this.flushValidation(), state.timeout)
    const pending = (state.pending ??= { fields: new Set(), touched: false, options, waiters: [] })
    if (fields) for (const field of fields) pending.fields.add(field)
    else pending.touched = true
    pending.options = options
    return new Promise((resolve, reject) => pending.waiters.push({ resolve, reject }))
  }

  private flushValidation(): void {
    const state = this.precog
    state.timer = null
    const pending = state.pending
    if (!pending) return
    state.pending = null
    state.timer = setTimeout(() => this.flushValidation(), state.timeout)
    const fields = new Set(pending.fields)
    if (pending.touched) for (const field of state.touched) fields.add(field)
    this.validateBound([...fields], pending.options).then(
      (outcome) => pending.waiters.forEach((w) => w.resolve(outcome)),
      (error: unknown) => pending.waiters.forEach((w) => w.reject(error)),
    )
  }

  /** Bound endpoint; `null` fields means the touched ones, and nothing to validate sends nothing. */
  private validateBound(
    fields: string[] | null,
    options: FormValidateOptions<K>,
  ): Promise<K['outcome']> {
    const only = fields ?? [...this.precog.touched]
    if (only.length === 0) return Promise.resolve({ status: 'cancelled' } as K['outcome'])
    const { method, url } = this.endpoint('validate')
    return this.precognize(method, url, only, options, this.precog.files)
  }

  private async precognize(
    method: Method,
    url: string | URL,
    requested: string[],
    options: FormValidateOptions<K>,
    includeFiles: boolean,
  ): Promise<K['outcome']> {
    const cancelled = { status: 'cancelled' } as K['outcome']
    if (options.onBefore?.() === false) return cancelled

    let data = this.transformer(this.data)
    let only = requested
    if (!includeFiles) {
      only = requested.filter((field) => !hasFiles(valueAt(data, field)))
      if (requested.length > 0 && only.length === 0) return cancelled
      data = withoutFiles(data) as Record<string, unknown>
    }

    const headers: Record<string, string> = { ...(options.headers ?? {}), Precognition: 'true' }
    if (only.length > 0) headers['Precognition-Validate-Only'] = only.join(',')
    const clearScoped = (): void => {
      if (only.length > 0) this.clearErrors(...only)
      else this.clearErrors()
    }
    const markValidated = (): void => {
      for (const field of only.length > 0 ? only : Object.keys(this.data))
        this.precog.validated.add(field)
    }

    this.validation?.abort()
    const controller = (this.validation = new AbortController())
    this.validating = true

    try {
      const result = await this.precognition(method, url, data, headers, controller.signal)
      if (controller.signal.aborted) return cancelled

      switch (result.kind) {
        case 'invalid': {
          const scoped =
            only.length > 0
              ? Object.fromEntries(Object.entries(result.errors).filter(([k]) => only.includes(k)))
              : result.errors
          clearScoped()
          this.setError(scoped)
          markValidated()
          this.recordInvalid(result.detail)
          warnIfOnlyOnError(this, 'validate', options)
          options.onInvalid?.(result.errors, result.detail)
          return result.outcome
        }
        case 'error':
          this.recordError(result.error)
          options.onError?.(result.error)
          return result.outcome
        case 'passed':
          clearScoped()
          markValidated()
          options.onSuccess?.()
          return result.outcome
        case 'unexpected':
          console.warn(
            `[bridge] form.validate(): ${String(url)} did not answer as Precognition (got ${result.got}). Add the \`precognitive\` middleware to the route.`,
          )
          return cancelled
        default:
          return cancelled
      }
    } catch (error) {
      if (controller.signal.aborted) return cancelled
      throw error
    } finally {
      if (this.validation === controller) {
        this.validation = null
        this.validating = false
      }
      options.onFinish?.()
    }
  }

  /** Flags at the start of a submission. */
  protected beginSubmit(): void {
    this.processing = true
    this.progress = null
    this.wasSuccessful = false
    this.recentlySuccessful = false
    this.lastError = null
    if (this.recentlyTimer) clearTimeout(this.recentlyTimer)
  }

  /** Flags when a submission is over, whatever its result. */
  protected endSubmit(): void {
    this.processing = false
    this.progress = null
  }

  /**
   * Success bookkeeping: errors cleared, success flags, then the values. `resetOnSuccess: true`
   * restores every default; a field list resets those fields first, so the new defaults
   * (`setDefaultsOnSuccess`, default true) take their old values.
   */
  protected completeSuccess(options: SubmitResetOptions): void {
    this.clearErrors()
    this.wasSuccessful = true
    this.recentlySuccessful = true
    this.recentlyTimer = setTimeout(() => {
      this.recentlySuccessful = false
    }, this.options.recentlySuccessfulFor ?? 2000)
    const reset = options.resetOnSuccess ?? this.options.resetOnSuccess
    if (reset === true) {
      this.reset()
      return
    }
    if (Array.isArray(reset)) this.reset(...(reset as Array<keyof T & string>))
    if (options.setDefaultsOnSuccess ?? this.options.setDefaultsOnSuccess ?? true)
      this.setDefaults()
  }

  /** After a validation error or other error response: `resetOnError`. */
  protected completeFailure(options: SubmitResetOptions): void {
    const reset = options.resetOnError ?? this.options.resetOnError
    if (reset === true) this.reset()
    else if (Array.isArray(reset)) this.reset(...(reset as Array<keyof T & string>))
  }

  protected setErrorsFromServer(errors: ValidationErrors): void {
    const flat: Record<string, string> = {}
    for (const [key, messages] of Object.entries(errors)) flat[key] = messages[0] ?? ''
    this.errors = flat
    this.allErrors = { ...errors }
  }
}

interface PrecognitionState<K extends FormTransport> {
  /** Bound by `withPrecognition` / `useForm(method, url, data)`. */
  endpoint: { method: Method; url: string | URL } | null
  touched: Set<string>
  /** Fields a Precognition answer covered, for `valid()`. */
  validated: Set<string>
  timeout: number
  files: boolean
  timer: ReturnType<typeof setTimeout> | null
  /** Calls made during the debounce window, sent together when it ends. */
  pending: {
    fields: Set<string>
    /** A call asked for the touched fields. */
    touched: boolean
    options: FormValidateOptions<K>
    waiters: Array<{ resolve: (outcome: K['outcome']) => void; reject: (error: unknown) => void }>
  } | null
}

/** The value at a dotted path (`items.0.photo`). */
function valueAt(data: unknown, path: string): unknown {
  let cursor = data
  for (const segment of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

/** A copy of the data without `File`, `Blob` and `FileList` values. */
function withoutFiles(value: unknown): unknown {
  if (isFile(value)) return undefined
  if (Array.isArray(value)) return value.filter((item) => !isFile(item)).map(withoutFiles)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!isFile(item)) out[key] = withoutFiles(item)
    }
    return out
  }
  return value
}

function isFile(value: unknown): boolean {
  return (
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof FileList !== 'undefined' && value instanceof FileList)
  )
}

const warnedForms = new WeakSet<object>()

/**
 * Validation errors go to `onInvalid`; `onError` is for other failures. When a
 * 422 reaches a call that passed only `onError`, say so once per form, since
 * the handler silently never runs.
 */
export function warnIfOnlyOnError(
  form: object,
  action: string,
  options: { onError?: unknown; onInvalid?: unknown },
): void {
  if (!options.onError || options.onInvalid || warnedForms.has(form)) return
  warnedForms.add(form)
  console.warn(
    `[bridge] form.${action}(): the server answered 422 with validation errors. They are in form.errors and are passed to onInvalid, not onError; this call only passed onError. Handle validation errors in onInvalid.`,
  )
}

export function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // Fall through for values structuredClone cannot handle (e.g. functions).
    }
  }
  if (Array.isArray(value)) return value.map(clone) as T
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof File) &&
    !(value instanceof Blob) &&
    !(value instanceof Date)
  ) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = clone(v)
    return out as T
  }
  return value
}
