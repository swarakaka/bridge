import type { UploadProgress } from '../http/RequestManager.js'
import type { Method } from '../router/url.js'
import type { ValidationErrors } from '../router/Visit.js'

export type FormData_ = Record<string, unknown>

export interface FormOptions {
  /** Reset to defaults after a successful submit. */
  resetOnSuccess?: boolean | undefined
  /** How long `recentlySuccessful` stays true, in ms. */
  recentlySuccessfulFor?: number | undefined
}

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
 * Field state shared by every form (PLAN §14, §14.1): values, defaults,
 * errors, submission flags and Precognition. Subclasses supply the transport
 * (`submit`, `cancel`, `precognition`). Framework adapters wrap instances in
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

  constructor(initial: T, options: FormOptions = {}) {
    this.data = clone(initial)
    this.defaults = clone(initial)
    this.options = options
  }

  abstract submit(
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

  get isDirty(): boolean {
    return JSON.stringify(this.data) !== JSON.stringify(this.defaults)
  }

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0
  }

  get(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submit('get', url, options)
  }

  post(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submit('post', url, options)
  }

  put(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submit('put', url, options)
  }

  patch(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submit('patch', url, options)
  }

  delete(url: string | URL, options?: K['submitOptions']): Promise<K['outcome']> {
    return this.submit('delete', url, options)
  }

  setData(values: Partial<T>): this
  setData<F extends keyof T>(key: F, value: T[F]): this
  setData(keyOrValues: keyof T | Partial<T>, value?: unknown): this {
    if (typeof keyOrValues === 'object') Object.assign(this.data, keyOrValues)
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

  reset(...fields: Array<keyof T & string>): this {
    if (fields.length === 0) {
      this.data = clone(this.defaults)
    } else {
      for (const field of fields)
        (this.data as Record<string, unknown>)[field] = clone(this.defaults[field])
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
   * Validate through Laravel Precognition without running the controller.
   * With fields, only those rules run and only their errors change; a 204
   * clears them. The route needs the `precognitive` middleware.
   *
   * Runs beside submissions: it never cancels one, and a newer call
   * supersedes an older one still in flight.
   */
  async validate(
    method: Method,
    url: string | URL,
    fields: string | string[] = [],
    options: FormValidateOptions<K> = {},
  ): Promise<K['outcome']> {
    const cancelled = { status: 'cancelled' } as K['outcome']
    const only = Array.isArray(fields) ? fields : [fields]
    const headers: Record<string, string> = { ...(options.headers ?? {}), Precognition: 'true' }
    if (only.length > 0) headers['Precognition-Validate-Only'] = only.join(',')
    const clearScoped = (): void => {
      if (only.length > 0) this.clearErrors(...only)
      else this.clearErrors()
    }

    this.validation?.abort()
    const controller = (this.validation = new AbortController())
    this.validating = true

    try {
      const result = await this.precognition(
        method,
        url,
        this.transformer(this.data),
        headers,
        controller.signal,
      )
      if (controller.signal.aborted) return cancelled

      switch (result.kind) {
        case 'invalid': {
          const scoped =
            only.length > 0
              ? Object.fromEntries(Object.entries(result.errors).filter(([k]) => only.includes(k)))
              : result.errors
          clearScoped()
          this.setError(scoped)
          this.recordInvalid(result.detail)
          options.onInvalid?.(result.errors, result.detail)
          return result.outcome
        }
        case 'error':
          this.recordError(result.error)
          options.onError?.(result.error)
          return result.outcome
        case 'passed':
          clearScoped()
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

  /** Success bookkeeping: errors cleared, success flags, then reset or new defaults. */
  protected completeSuccess(resetOnSuccess: boolean | undefined): void {
    this.clearErrors()
    this.wasSuccessful = true
    this.recentlySuccessful = true
    this.recentlyTimer = setTimeout(() => {
      this.recentlySuccessful = false
    }, this.options.recentlySuccessfulFor ?? 2000)
    if (resetOnSuccess ?? this.options.resetOnSuccess) this.reset()
    else this.setDefaults()
  }

  protected setErrorsFromServer(errors: ValidationErrors): void {
    const flat: Record<string, string> = {}
    for (const [key, messages] of Object.entries(errors)) flat[key] = messages[0] ?? ''
    this.errors = flat
    this.allErrors = { ...errors }
  }
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
