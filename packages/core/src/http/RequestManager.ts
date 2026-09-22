import { HEADERS, PAGE_ACCEPT } from '@swarakaka/bridge-protocol'
import { readXsrfToken } from './csrf.js'
import { hasFiles, objectToFormData } from './formData.js'
import type { HttpResponse } from './responseParser.js'
import { mergeQuery, type Method } from '../router/url.js'

export interface HttpRequest {
  method: Method
  url: string | URL
  data?: Record<string, unknown> | FormData | undefined
  headers?: Record<string, string> | undefined
  only?: string[] | undefined
  except?: string[] | undefined
  component?: string | null | undefined
  build?: string | null | undefined
  prefetch?: boolean | undefined
  signal?: AbortSignal | undefined
  onProgress?: ((progress: UploadProgress) => void) | undefined
  /** Force multipart + XHR (used for uploads); auto-detected from data otherwise. */
  forceFormData?: boolean | undefined
}

export interface UploadProgress {
  loaded: number
  total: number
  /** 0–100 */
  percentage: number
}

export interface PreparedRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: URL
  headers: Record<string, string>
  body: FormData | string | null
  multipart: boolean
}

export interface RequestManagerOptions {
  fetch?: typeof fetch | undefined
  credentials?: RequestCredentials | undefined
  xsrfCookie?: (() => string | null) | undefined
}

/**
 * Builds and sends Bridge page requests. Uses fetch, or XHR when a multipart
 * body needs upload progress.
 */
export class RequestManager {
  private readonly fetchImpl: typeof fetch
  private readonly credentials: RequestCredentials
  private readonly xsrfCookie: () => string | null

  constructor(options: RequestManagerOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.credentials = options.credentials ?? 'same-origin'
    this.xsrfCookie = options.xsrfCookie ?? (() => readXsrfToken())
  }

  prepare(request: HttpRequest): PreparedRequest {
    const headers: Record<string, string> = {
      Accept: PAGE_ACCEPT,
      'X-Requested-With': 'XMLHttpRequest',
      ...(request.headers ?? {}),
    }

    if (request.build) headers[HEADERS.build] = request.build
    if (request.only && request.only.length > 0) headers[HEADERS.only] = request.only.join(',')
    if (request.except && request.except.length > 0)
      headers[HEADERS.except] = request.except.join(',')
    if ((request.only?.length || request.except?.length) && request.component) {
      headers[HEADERS.component] = request.component
    }
    if (request.prefetch) headers['Purpose'] = 'prefetch'

    let url =
      request.url instanceof URL ? new URL(request.url.href) : new URL(request.url, currentHref())
    let method = request.method.toUpperCase() as PreparedRequest['method']
    let body: FormData | string | null = null
    let multipart = false

    if (method === 'GET') {
      if (
        request.data &&
        !(request.data instanceof FormData) &&
        Object.keys(request.data).length > 0
      ) {
        url = mergeQuery(url, request.data)
      }
    } else {
      const token = this.xsrfCookie()
      if (token) headers['X-XSRF-TOKEN'] = token

      const data = request.data ?? {}
      multipart = request.forceFormData === true || data instanceof FormData || hasFiles(data)

      if (multipart) {
        const form = data instanceof FormData ? data : objectToFormData(data)
        if (method !== 'POST') {
          form.append('_method', method)
          method = 'POST'
        }
        body = form
      } else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(data)
      }
    }

    return { method, url, headers, body, multipart }
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    const prepared = this.prepare(request)

    if (prepared.multipart && request.onProgress && typeof XMLHttpRequest !== 'undefined') {
      return this.sendXhr(prepared, request)
    }

    const response = await this.fetchImpl(prepared.url.href, {
      method: prepared.method,
      headers: prepared.headers,
      body: prepared.body,
      credentials: this.credentials,
      signal: request.signal ?? null,
      redirect: 'follow',
    })

    return {
      status: response.status,
      headers: response.headers,
      url: response.url || prepared.url.href,
      text: () => response.text(),
    }
  }

  private sendXhr(prepared: PreparedRequest, request: HttpRequest): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(prepared.method, prepared.url.href, true)
      xhr.withCredentials = this.credentials !== 'omit'
      for (const [name, value] of Object.entries(prepared.headers))
        xhr.setRequestHeader(name, value)

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return
        request.onProgress?.({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        })
      })

      const abort = (): void => {
        xhr.abort()
        reject(new DOMException('The request was aborted.', 'AbortError'))
      }
      request.signal?.addEventListener('abort', abort, { once: true })

      xhr.addEventListener('load', () => {
        request.signal?.removeEventListener('abort', abort)
        resolve({
          status: xhr.status,
          headers: parseHeaders(xhr.getAllResponseHeaders()),
          url: xhr.responseURL || prepared.url.href,
          text: () => Promise.resolve(xhr.responseText),
        })
      })
      xhr.addEventListener('error', () => reject(new TypeError('Network request failed')))
      xhr.send(prepared.body)
    })
  }
}

function parseHeaders(raw: string): Headers {
  const headers = new Headers()
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const index = line.indexOf(':')
    if (index > 0) headers.append(line.slice(0, index).trim(), line.slice(index + 1).trim())
  }
  return headers
}

function currentHref(): string {
  return typeof window === 'undefined' ? 'http://localhost/' : window.location.href
}
