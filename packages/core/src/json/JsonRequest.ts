import type { UploadProgress } from '../http/RequestManager.js'
import type { Method } from '../router/url.js'
import type { ValidationErrors } from '../router/Visit.js'
import {
  firstErrors,
  type JsonClient,
  type JsonError,
  type JsonMeta,
  type JsonOutcome,
  type JsonRequestOptions,
} from './JsonClient.js'

export interface JsonHandleOptions {
  /** Headers sent with every request from this handle (for example `Authorization`). */
  headers?: Record<string, string> | undefined
}

export type JsonCallOptions<T> = Omit<JsonRequestOptions, 'signal'> & {
  onSuccess?: ((data: T | null, meta: JsonMeta) => void) | undefined
  onInvalid?: ((errors: ValidationErrors, message: string) => void) | undefined
  onError?: ((error: JsonError) => void) | undefined
  onException?: ((error: unknown) => void) | undefined
  onFinish?: ((outcome: JsonOutcome<T>) => void) | undefined
}

/**
 * A stateful JSON-mode request handle: the counterpart of `Form` for calls
 * that do not navigate. One request in flight at a time; starting another
 * cancels the previous one. Adapters wrap it in their reactivity system.
 */
export class JsonRequest<T = unknown> {
  /** `data` of the last successful response. */
  data: T | null = null
  meta: JsonMeta = {}
  /** First message per field from the last 422. */
  errors: Record<string, string> = {}
  /** All messages per field from the last 422. */
  allErrors: ValidationErrors = {}
  /** Message of the last 422 or error response. */
  message: string | null = null
  lastError: JsonError | null = null
  processing = false
  progress: UploadProgress | null = null
  httpStatus: number | null = null
  wasSuccessful = false

  private controller: AbortController | null = null

  constructor(
    private readonly client: JsonClient,
    private readonly options: JsonHandleOptions = {},
  ) {}

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0
  }

  async request(
    method: Method,
    url: string | URL,
    options: JsonCallOptions<T> = {},
  ): Promise<JsonOutcome<T>> {
    this.cancel()
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()
    this.controller = controller
    this.processing = true
    this.progress = null
    this.wasSuccessful = false
    this.message = null
    this.lastError = null

    const { onSuccess, onInvalid, onError, onException, onFinish, ...request } = options
    const outcome = await this.client.request<T>(method, url, {
      ...request,
      headers: { ...(this.options.headers ?? {}), ...(request.headers ?? {}) },
      signal: controller?.signal,
      onProgress: (progress) => {
        this.progress = progress
        request.onProgress?.(progress)
      },
    })

    // A newer request replaced this one; leave its state alone.
    if (controller !== this.controller) return outcome

    this.controller = null
    this.processing = false
    this.progress = null

    switch (outcome.status) {
      case 'success':
        this.data = outcome.data
        this.meta = outcome.meta
        this.httpStatus = outcome.httpStatus
        this.wasSuccessful = true
        this.clearErrors()
        onSuccess?.(outcome.data, outcome.meta)
        break
      case 'invalid':
        this.httpStatus = 422
        this.errors = firstErrors(outcome.errors)
        this.allErrors = { ...outcome.errors }
        this.message = outcome.message
        onInvalid?.(outcome.errors, outcome.message)
        break
      case 'error':
        this.httpStatus = outcome.httpStatus
        this.lastError = outcome.error
        this.message = outcome.error.message
        onError?.(outcome.error)
        break
      case 'exception':
        this.httpStatus = null
        onException?.(outcome.error)
        break
      case 'cancelled':
        break
    }

    onFinish?.(outcome)
    return outcome
  }

  get(url: string | URL, options?: JsonCallOptions<T>): Promise<JsonOutcome<T>> {
    return this.request('get', url, options)
  }

  post(url: string | URL, options?: JsonCallOptions<T>): Promise<JsonOutcome<T>> {
    return this.request('post', url, options)
  }

  put(url: string | URL, options?: JsonCallOptions<T>): Promise<JsonOutcome<T>> {
    return this.request('put', url, options)
  }

  patch(url: string | URL, options?: JsonCallOptions<T>): Promise<JsonOutcome<T>> {
    return this.request('patch', url, options)
  }

  delete(url: string | URL, options?: JsonCallOptions<T>): Promise<JsonOutcome<T>> {
    return this.request('delete', url, options)
  }

  /** Abort the in-flight request, if any. `processing` returns to false. */
  cancel(): void {
    const controller = this.controller
    if (!controller) return
    this.controller = null
    this.processing = false
    this.progress = null
    controller.abort()
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

  /** Forget data, meta, errors and status. Cancels an in-flight request. */
  reset(): this {
    this.cancel()
    this.data = null
    this.meta = {}
    this.message = null
    this.lastError = null
    this.httpStatus = null
    this.wasSuccessful = false
    return this.clearErrors()
  }
}
