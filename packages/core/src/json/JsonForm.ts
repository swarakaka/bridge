import type { Method } from '../router/url.js'
import type { ValidationErrors } from '../router/Visit.js'
import {
  FormState,
  type FormData_,
  type FormOptions,
  type FormValidateOptions,
  type PrecognitionResult,
  type SubmitResetOptions,
  warnIfOnlyOnError,
} from '../forms/FormState.js'
import type {
  JsonClient,
  JsonError,
  JsonMeta,
  JsonOutcome,
  JsonRequestOptions,
} from './JsonClient.js'
import type { JsonHandleOptions } from './JsonRequest.js'

export interface JsonFormOptions extends FormOptions, JsonHandleOptions {}

export type JsonSubmitOptions<R = unknown> = Omit<
  JsonRequestOptions,
  'signal' | 'data' | 'mutation'
> &
  SubmitResetOptions & {
    /** Return `false` to skip the request. */
    onBefore?: (() => boolean | void) | undefined
    onStart?: (() => void) | undefined
    onSuccess?: ((result: R | null, meta: JsonMeta) => void) | undefined
    onInvalid?: ((errors: ValidationErrors, message: string) => void) | undefined
    onError?: ((error: JsonError) => void) | undefined
    onException?: ((error: unknown) => void) | undefined
    onCancel?: (() => void) | undefined
    onFinish?: ((outcome: JsonOutcome<R>) => void) | undefined
  }

/** JSON-mode transport types for `FormState`. */
export interface JsonFormTransport<R> {
  submitOptions: JsonSubmitOptions<R>
  outcome: JsonOutcome<R>
  error: JsonError
  invalid: string
}

export type JsonValidateOptions<R = unknown> = FormValidateOptions<JsonFormTransport<R>>

/**
 * A form submitted in JSON mode (PLAN §14.1): the same routes as page mode
 * with `Accept: application/json`, without navigating. Field state is the
 * same as `Form`; the last successful response is `result` (the envelope's
 * `data`, or the whole body for a non-Bridge route) with `meta`. A 419 or 401
 * is reported, never acted on. One submission in flight; a new one cancels it.
 */
export class JsonForm<T extends FormData_, R = unknown> extends FormState<T, JsonFormTransport<R>> {
  /** `data` of the last successful response. */
  result: R | null = null
  meta: JsonMeta = {}
  httpStatus: number | null = null
  /** Message of the last 422 or error response. */
  message: string | null = null

  private controller: AbortController | null = null

  constructor(
    private readonly client: JsonClient,
    initial: T,
    options: JsonFormOptions = {},
  ) {
    super(initial, options)
  }

  protected async submitTo(
    method: Method,
    url: string | URL,
    options: JsonSubmitOptions<R> = {},
  ): Promise<JsonOutcome<R>> {
    const {
      resetOnSuccess,
      resetOnError,
      setDefaultsOnSuccess,
      onBefore,
      onStart,
      onProgress,
      onSuccess,
      onInvalid,
      onError,
      onException,
      onCancel,
      onFinish,
      ...request
    } = options
    if (onBefore?.() === false) return { status: 'cancelled' }

    this.cancel()
    const controller = (this.controller = new AbortController())
    this.beginSubmit()
    this.message = null
    onStart?.()

    const outcome = await this.client.request<R>(method, url, {
      ...request,
      data: this.transformer(this.data),
      headers: this.headersWith(request.headers),
      signal: controller.signal,
      onProgress: (progress) => {
        this.progress = progress
        onProgress?.(progress)
      },
    })

    // Cancelled or superseded: the newer state is not ours to touch.
    if (controller !== this.controller) {
      const cancelled: JsonOutcome<R> = { status: 'cancelled' }
      onCancel?.()
      onFinish?.(cancelled)
      return cancelled
    }

    this.controller = null
    this.endSubmit()

    switch (outcome.status) {
      case 'success':
        this.result = outcome.data
        this.meta = outcome.meta
        this.httpStatus = outcome.httpStatus
        this.completeSuccess({ resetOnSuccess, setDefaultsOnSuccess })
        onSuccess?.(outcome.data, outcome.meta)
        break
      case 'invalid':
        this.setErrorsFromServer(outcome.errors)
        this.recordInvalid(outcome.message)
        warnIfOnlyOnError(this, method, { onError, onInvalid })
        this.completeFailure({ resetOnError })
        onInvalid?.(outcome.errors, outcome.message)
        break
      case 'error':
        this.recordError(outcome.error)
        this.completeFailure({ resetOnError })
        onError?.(outcome.error)
        break
      case 'exception':
        this.httpStatus = null
        onException?.(outcome.error)
        break
      case 'cancelled':
        onCancel?.()
        break
    }

    onFinish?.(outcome)
    return outcome
  }

  /** Abort the in-flight submission, if any. `processing` returns to false. */
  cancel(): void {
    const controller = this.controller
    if (!controller) return
    this.controller = null
    this.endSubmit()
    controller.abort()
  }

  /** Precognition in JSON mode: a 422 is Laravel-native `{message, errors}`, a 204 passes. */
  protected async precognition(
    method: Method,
    url: string | URL,
    data: Record<string, unknown>,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<PrecognitionResult<JsonFormTransport<R>>> {
    const outcome = await this.client.request<R>(method, url, {
      data,
      headers: this.headersWith(headers),
      signal,
      mutation: false,
    })
    switch (outcome.status) {
      case 'invalid':
        return { kind: 'invalid', errors: outcome.errors, detail: outcome.message, outcome }
      case 'error':
        return { kind: 'error', error: outcome.error, outcome }
      case 'exception':
        throw outcome.error
      case 'cancelled':
        return { kind: 'cancelled' }
      case 'success':
        return outcome.httpStatus === 204
          ? { kind: 'passed', outcome }
          : { kind: 'unexpected', got: `HTTP ${outcome.httpStatus}` }
    }
  }

  protected recordInvalid(message: string): void {
    this.httpStatus = 422
    this.message = message
  }

  protected override recordError(error: JsonError): void {
    this.lastError = error
    this.httpStatus = error.status
    this.message = error.message
  }

  private headersWith(extra: Record<string, string> | undefined): Record<string, string> {
    return { ...((this.options as JsonFormOptions).headers ?? {}), ...(extra ?? {}) }
  }
}
