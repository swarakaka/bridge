import type { BridgeError } from '@swarakaka/bridge-protocol'
import type { Router } from '../router/Router.js'
import type { Method } from '../router/url.js'
import type { ValidationErrors, VisitOptions, VisitOutcome } from '../router/Visit.js'
import {
  FormState,
  type FormData_,
  type FormOptions,
  type FormValidateOptions,
  type PrecognitionResult,
  type SubmitResetOptions,
  warnIfOnlyOnError,
} from './FormState.js'

export type { FormData_, FormOptions } from './FormState.js'

export type SubmitOptions = Omit<VisitOptions, 'method' | 'data'> & SubmitResetOptions

/** Page-visit transport types for `FormState`. */
export interface PageFormTransport {
  submitOptions: SubmitOptions
  outcome: VisitOutcome
  error: BridgeError['error']
  invalid: BridgeError['error']
}

export type ValidateOptions = FormValidateOptions<PageFormTransport>

/**
 * Form state machine (PLAN §14) submitted as a page visit: redirects, 409 and
 * 406 behave as navigations, and a 422 attaches errors to this form only.
 */
export class Form<T extends FormData_> extends FormState<T, PageFormTransport> {
  private cancelFn: (() => void) | null = null

  constructor(
    private readonly router: Router,
    initial: T,
    options: FormOptions = {},
  ) {
    super(initial, options)
  }

  protected async submitTo(
    method: Method,
    url: string | URL,
    options: SubmitOptions = {},
  ): Promise<VisitOutcome> {
    const data = this.transformer(this.data)
    const optimistic = this.takeOptimistic() ?? options.optimistic
    this.beginSubmit()

    const outcome = await this.router.visit(url, {
      ...options,
      method,
      data,
      optimistic,
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
        warnIfOnlyOnError(this, method, options)
        this.completeFailure(options)
        options.onInvalid?.(errors, error)
      },
      onError: (error) => {
        this.lastError = error
        this.completeFailure(options)
        options.onError?.(error)
      },
      onSuccess: (page) => {
        this.completeSuccess(options)
        options.onSuccess?.(page)
      },
      onFinish: (visit) => {
        this.endSubmit()
        this.cancelFn = null
        options.onFinish?.(visit)
      },
    })

    // A full document navigation keeps `processing` so the UI stays disabled. An
    // onBefore that refused the visit never reaches onFinish, so reset here.
    if (outcome.status !== 'redirected' && this.processing) {
      this.endSubmit()
      this.cancelFn = null
    }

    return outcome
  }

  cancel(): void {
    this.cancelFn?.()
  }

  /** Precognition through `router.request()`, outside the visit pipeline. */
  protected async precognition(
    method: Method,
    url: string | URL,
    data: Record<string, unknown>,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<PrecognitionResult<PageFormTransport>> {
    const parsed = await this.router.request(url, { method, data, headers, signal })

    if (
      parsed.kind === 'error' &&
      (parsed.error.kind === 'validation' || parsed.error.status === 422)
    ) {
      const errors = validationErrors(parsed.error.errors)
      return {
        kind: 'invalid',
        errors,
        detail: parsed.error,
        outcome: { status: 'invalid', errors, error: parsed.error },
      }
    }
    if (parsed.kind === 'error') {
      return {
        kind: 'error',
        error: parsed.error,
        outcome: { status: 'error', error: parsed.error },
      }
    }
    const page = this.router.page
    if (parsed.kind === 'empty' && page) {
      return { kind: 'passed', outcome: { status: 'success', page } }
    }
    return { kind: 'unexpected', got: parsed.kind }
  }

  protected recordInvalid(error: BridgeError['error']): void {
    this.lastError = error
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
