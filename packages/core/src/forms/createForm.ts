import type { BridgeError } from '@swarakaka/bridge-protocol'
import type { UploadProgress } from '../http/RequestManager.js'
import type { Router } from '../router/Router.js'
import type { Method } from '../router/url.js'
import type { ValidationErrors, VisitOptions, VisitOutcome } from '../router/Visit.js'

export type FormData_ = Record<string, unknown>

export interface FormOptions {
  /** Reset to defaults after a successful submit. */
  resetOnSuccess?: boolean | undefined
  /** How long `recentlySuccessful` stays true, in ms. */
  recentlySuccessfulFor?: number | undefined
}

export type SubmitOptions = Omit<VisitOptions, 'method' | 'data'> & {
  resetOnSuccess?: boolean | undefined
}

export type ValidateOptions = Pick<SubmitOptions, 'headers' | 'onInvalid' | 'onError'> & {
  onSuccess?: (() => void) | undefined
  onFinish?: (() => void) | undefined
}

/**
 * Form state machine (PLAN §14). Framework adapters wrap the instance in
 * their reactivity system; all mutations go through `this` so proxies work.
 */
export class Form<T extends FormData_> {
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
  lastError: BridgeError['error'] | null = null

  private transformer: (data: T) => Record<string, unknown> = (data) => data
  private recentlyTimer: ReturnType<typeof setTimeout> | null = null
  private cancelFn: (() => void) | null = null
  private readonly options: FormOptions
  private readonly unremembered = new Set<string>()

  constructor(
    private readonly router: Router,
    initial: T,
    options: FormOptions = {},
  ) {
    this.data = clone(initial)
    this.defaults = clone(initial)
    this.options = options
  }

  get isDirty(): boolean {
    return JSON.stringify(this.data) !== JSON.stringify(this.defaults)
  }

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0
  }

  setData(values: Partial<T>): this
  setData<K extends keyof T>(key: K, value: T[K]): this
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

  async submit(
    method: Method,
    url: string | URL,
    options: SubmitOptions = {},
  ): Promise<VisitOutcome> {
    const data = this.transformer(this.data)
    this.processing = true
    this.progress = null
    this.wasSuccessful = false
    this.recentlySuccessful = false
    this.lastError = null
    if (this.recentlyTimer) clearTimeout(this.recentlyTimer)

    const outcome = await this.router.visit(url, {
      ...options,
      method,
      data,
      forceFormData: options.forceFormData,
      onBefore: (visit) => {
        this.cancelFn = () => this.router.cancel()
        return options.onBefore?.(visit)
      },
      onProgress: (progress) => {
        this.progress = progress
        options.onProgress?.(progress)
      },
      onInvalid: (errors, error) => {
        this.setErrorsFromServer(errors)
        this.lastError = error
        options.onInvalid?.(errors, error)
      },
      onError: (error) => {
        this.lastError = error
        options.onError?.(error)
      },
      onSuccess: (page) => {
        this.clearErrors()
        this.wasSuccessful = true
        this.recentlySuccessful = true
        this.recentlyTimer = setTimeout(() => {
          this.recentlySuccessful = false
        }, this.options.recentlySuccessfulFor ?? 2000)
        if (options.resetOnSuccess ?? this.options.resetOnSuccess) this.reset()
        else this.setDefaults()
        options.onSuccess?.(page)
      },
      onFinish: (visit) => {
        this.processing = false
        this.progress = null
        this.cancelFn = null
        options.onFinish?.(visit)
      },
    })

    // A full document navigation keeps `processing` so the UI stays disabled. An
    // onBefore that refused the visit never reaches onFinish, so reset here.
    if (outcome.status !== 'redirected' && this.processing) {
      this.processing = false
      this.progress = null
      this.cancelFn = null
    }

    return outcome
  }

  get(url: string | URL, options?: SubmitOptions): Promise<VisitOutcome> {
    return this.submit('get', url, options)
  }

  post(url: string | URL, options?: SubmitOptions): Promise<VisitOutcome> {
    return this.submit('post', url, options)
  }

  put(url: string | URL, options?: SubmitOptions): Promise<VisitOutcome> {
    return this.submit('put', url, options)
  }

  patch(url: string | URL, options?: SubmitOptions): Promise<VisitOutcome> {
    return this.submit('patch', url, options)
  }

  delete(url: string | URL, options?: SubmitOptions): Promise<VisitOutcome> {
    return this.submit('delete', url, options)
  }

  cancel(): void {
    this.cancelFn?.()
  }

  validating = false

  private validation: AbortController | null = null

  /**
   * Validate through Laravel Precognition without running the controller.
   * With fields, only those rules run and only their errors change; a 204
   * clears them. The route needs the `precognitive` middleware.
   *
   * Runs beside navigation: it never cancels a submit or a visit, emits no
   * router events, and a newer call supersedes an older one still in flight.
   */
  async validate(
    method: Method,
    url: string | URL,
    fields: string | string[] = [],
    options: ValidateOptions = {},
  ): Promise<VisitOutcome> {
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
      const parsed = await this.router.request(url, {
        method,
        data: this.transformer(this.data),
        headers,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return { status: 'cancelled' }

      if (
        parsed.kind === 'error' &&
        (parsed.error.kind === 'validation' || parsed.error.status === 422)
      ) {
        const errors = validationErrors(parsed.error.errors)
        const scoped =
          only.length > 0
            ? Object.fromEntries(Object.entries(errors).filter(([k]) => only.includes(k)))
            : errors
        clearScoped()
        this.setError(scoped)
        this.lastError = parsed.error
        options.onInvalid?.(errors, parsed.error)
        return { status: 'invalid', errors, error: parsed.error }
      }

      if (parsed.kind === 'error') {
        this.lastError = parsed.error
        options.onError?.(parsed.error)
        return { status: 'error', error: parsed.error }
      }

      const page = this.router.page
      if (parsed.kind === 'empty' && page) {
        clearScoped()
        options.onSuccess?.()
        return { status: 'success', page }
      }

      console.warn(
        `[bridge] form.validate(): ${String(url)} did not answer as Precognition (got ${parsed.kind}). Add the \`precognitive\` middleware to the route.`,
      )
      return { status: 'cancelled' }
    } catch (error) {
      if (controller.signal.aborted) return { status: 'cancelled' }
      throw error
    } finally {
      if (this.validation === controller) {
        this.validation = null
        this.validating = false
      }
      options.onFinish?.()
    }
  }

  private setErrorsFromServer(errors: ValidationErrors): void {
    const flat: Record<string, string> = {}
    for (const [key, messages] of Object.entries(errors)) flat[key] = messages[0] ?? ''
    this.errors = flat
    this.allErrors = { ...errors }
  }
}

/** Server errors as lists; a bare string (non-Laravel servers) becomes a one-item list. */
function validationErrors(raw: unknown): ValidationErrors {
  const out: ValidationErrors = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [field, messages] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(messages)) out[field] = messages.map(String)
    else if (typeof messages === 'string') out[field] = [messages]
  }
  return out
}

function clone<T>(value: T): T {
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
