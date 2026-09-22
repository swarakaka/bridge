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

    if (outcome.status === 'redirected') {
      // A full document navigation is underway; keep `processing` so the UI stays disabled.
      return outcome
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

  /**
   * Validate through Laravel Precognition without running the controller.
   * With fields, only those rules run and only their errors change; a 204
   * clears them. The route needs the `precognitive` middleware.
   */
  async validate(
    method: Method,
    url: string | URL,
    fields: string | string[] = [],
    options: SubmitOptions = {},
  ): Promise<VisitOutcome> {
    const only = Array.isArray(fields) ? fields : [fields]
    const headers: Record<string, string> = { ...(options.headers ?? {}), Precognition: 'true' }
    if (only.length > 0) headers['Precognition-Validate-Only'] = only.join(',')

    this.validating = true
    return this.router.visit(url, {
      ...options,
      method,
      data: this.transformer(this.data),
      headers,
      preserveState: true,
      preserveScroll: true,
      useCache: false,
      onInvalid: (errors, error) => {
        const scoped =
          only.length > 0
            ? Object.fromEntries(Object.entries(errors).filter(([k]) => only.includes(k)))
            : errors
        if (only.length > 0) this.clearErrors(...only)
        else this.clearErrors()
        this.setError(scoped)
        this.lastError = error
        options.onInvalid?.(errors, error)
      },
      onSuccess: (page) => {
        if (only.length > 0) this.clearErrors(...only)
        else this.clearErrors()
        options.onSuccess?.(page)
      },
      onFinish: (visit) => {
        this.validating = false
        options.onFinish?.(visit)
      },
    })
  }

  private setErrorsFromServer(errors: ValidationErrors): void {
    const flat: Record<string, string> = {}
    for (const [key, messages] of Object.entries(errors)) flat[key] = messages[0] ?? ''
    this.errors = flat
    this.allErrors = { ...errors }
  }
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
