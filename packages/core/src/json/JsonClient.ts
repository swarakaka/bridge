import { isJsonDocument } from '@swarakaka/bridge-protocol'
import type { BridgeJsonDocument, BridgeJsonError } from '@swarakaka/bridge-protocol'
import type { RequestManager, UploadProgress } from '../http/RequestManager.js'
import type { HttpResponse } from '../http/responseParser.js'
import type { Method } from '../router/url.js'
import type { ValidationErrors } from '../router/Visit.js'

export const JSON_ACCEPT = 'application/json'

/** `meta` of the JSON envelope (spec/json.md §1 and §3) plus application members. */
export interface JsonMeta {
  location?: string
  flash?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Error kinds for JSON mode, derived from the HTTP status (spec/errors.md §2)
 * because the Laravel-native body carries no `kind`. `invalid` marks a
 * response that was not JSON at all (for example an HTML login page).
 */
export type JsonErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'csrf'
  | 'throttled'
  | 'server'
  | 'http'
  | 'invalid'

export interface JsonError {
  kind: JsonErrorKind
  status: number
  message: string
  /** Seconds, from `Retry-After`, for `throttled`. */
  retryAfter: number | null
  /** The decoded body when it was JSON, for debug fields (`exception`, `trace`). */
  body: BridgeJsonError | null
}

export interface JsonRequestOptions {
  data?: Record<string, unknown> | FormData | undefined
  headers?: Record<string, string> | undefined
  /** Partial selection headers; JSON mode honours them (spec/headers.md). */
  only?: string[] | undefined
  except?: string[] | undefined
  signal?: AbortSignal | undefined
  onProgress?: ((progress: UploadProgress) => void) | undefined
  forceFormData?: boolean | undefined
}

export type JsonOutcome<T = unknown> =
  | {
      status: 'success'
      /** `data` of the envelope, or the whole body when the route did not return a Bridge envelope. */
      data: T | null
      meta: JsonMeta
      /** `meta.location` (mirrors the `Location` header on mutation results). */
      location: string | null
      httpStatus: number
      /** `true` when the body was a Bridge `{ data, meta }` envelope. */
      envelope: boolean
    }
  | { status: 'invalid'; errors: ValidationErrors; message: string; httpStatus: 422 }
  | { status: 'error'; error: JsonError; httpStatus: number }
  | { status: 'exception'; error: unknown }
  | { status: 'cancelled' }

/**
 * Calls the application's JSON mode: the same routes as page mode with
 * `Accept: application/json`. Shares the CSRF, credentials and upload path of
 * page visits. Never throws: every result is a `JsonOutcome`.
 */
export class JsonClient {
  constructor(private readonly http: RequestManager) {}

  async request<T = unknown>(
    method: Method,
    url: string | URL,
    options: JsonRequestOptions = {},
  ): Promise<JsonOutcome<T>> {
    let response: HttpResponse
    try {
      response = await this.http.send({
        method,
        url,
        data: options.data,
        headers: { Accept: JSON_ACCEPT, ...(options.headers ?? {}) },
        only: options.only,
        except: options.except,
        signal: options.signal,
        onProgress: options.onProgress,
        forceFormData: options.forceFormData,
      })
    } catch (error) {
      if (isAbort(error) || options.signal?.aborted) return { status: 'cancelled' }
      return { status: 'exception', error }
    }

    try {
      return await this.classify<T>(response)
    } catch (error) {
      return { status: 'exception', error }
    }
  }

  get<T = unknown>(url: string | URL, options?: JsonRequestOptions): Promise<JsonOutcome<T>> {
    return this.request<T>('get', url, options)
  }

  post<T = unknown>(url: string | URL, options?: JsonRequestOptions): Promise<JsonOutcome<T>> {
    return this.request<T>('post', url, options)
  }

  put<T = unknown>(url: string | URL, options?: JsonRequestOptions): Promise<JsonOutcome<T>> {
    return this.request<T>('put', url, options)
  }

  patch<T = unknown>(url: string | URL, options?: JsonRequestOptions): Promise<JsonOutcome<T>> {
    return this.request<T>('patch', url, options)
  }

  delete<T = unknown>(url: string | URL, options?: JsonRequestOptions): Promise<JsonOutcome<T>> {
    return this.request<T>('delete', url, options)
  }

  private async classify<T>(response: HttpResponse): Promise<JsonOutcome<T>> {
    const status = response.status

    if (status === 204 || status === 205 || status === 304) {
      return {
        status: 'success',
        data: null,
        meta: {},
        location: null,
        httpStatus: status,
        envelope: false,
      }
    }

    const text = await response.text()
    const json = decode(text, response.headers.get('content-type'))

    if (status >= 200 && status < 300) {
      if (json.ok && isJsonDocument(json.value)) {
        const document = json.value as BridgeJsonDocument & { meta?: JsonMeta }
        const meta: JsonMeta = { ...(document.meta ?? {}) }
        return {
          status: 'success',
          data: document.data as T | null,
          meta,
          location: typeof meta.location === 'string' ? meta.location : null,
          httpStatus: status,
          envelope: true,
        }
      }
      if (json.ok) {
        return {
          status: 'success',
          data: json.value as T,
          meta: {},
          location: null,
          httpStatus: status,
          envelope: false,
        }
      }
      return {
        status: 'error',
        httpStatus: status,
        error: invalid(status, 'The response was not JSON.'),
      }
    }

    const body = json.ok && isJsonError(json.value) ? json.value : null

    if (status === 422) {
      return {
        status: 'invalid',
        errors: normalizeErrors(body?.errors),
        message: body?.message ?? 'The given data was invalid.',
        httpStatus: 422,
      }
    }

    if (!json.ok || body === null) {
      return { status: 'error', httpStatus: status, error: invalid(status, `HTTP ${status}`) }
    }

    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
    return {
      status: 'error',
      httpStatus: status,
      error: {
        kind: kindFor(status),
        status,
        message: body.message,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
        body,
      },
    }
  }
}

export function kindFor(status: number): JsonErrorKind {
  switch (status) {
    case 401:
      return 'unauthenticated'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 409:
      return 'conflict'
    case 419:
      return 'csrf'
    case 429:
      return 'throttled'
    default:
      return status >= 500 ? 'server' : 'http'
  }
}

/** First message per field, the shape `Form.errors` uses. */
export function firstErrors(errors: ValidationErrors): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [key, messages] of Object.entries(errors)) flat[key] = messages[0] ?? ''
  return flat
}

function normalizeErrors(errors: BridgeJsonError['errors']): ValidationErrors {
  const out: ValidationErrors = {}
  if (!errors) return out
  for (const [key, messages] of Object.entries(errors)) {
    if (Array.isArray(messages)) out[key] = messages.map(String)
    else if (typeof messages === 'string') out[key] = [messages]
  }
  return out
}

function decode(
  text: string,
  contentType: string | null,
): { ok: true; value: unknown } | { ok: false } {
  if (contentType && !contentType.toLowerCase().includes('json')) return { ok: false }
  if (text.trim() === '') return { ok: true, value: null }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function invalid(status: number, message: string): JsonError {
  return { kind: 'invalid', status, message, retryAfter: null, body: null }
}

function isJsonError(value: unknown): value is BridgeJsonError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  )
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}
