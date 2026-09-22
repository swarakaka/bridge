import type { BridgeError, BridgePage } from '@swarakaka/bridge-protocol'
import type { UploadProgress } from '../http/RequestManager'
import type { Method } from './url'

export type ValidationErrors = Record<string, string[]>

export interface VisitOptions {
  method?: Method | undefined
  data?: Record<string, unknown> | FormData | undefined
  headers?: Record<string, string> | undefined
  replace?: boolean | undefined
  preserveState?: boolean | undefined
  preserveScroll?: boolean | undefined
  only?: string[] | undefined
  except?: string[] | undefined
  /** Let the visit use a fresh/stale cached page (GET only). Default true for GET. */
  useCache?: boolean | undefined
  forceFormData?: boolean | undefined
  onBefore?: ((visit: Visit) => void | boolean) | undefined
  onStart?: ((visit: Visit) => void) | undefined
  onProgress?: ((progress: UploadProgress) => void) | undefined
  onSuccess?: ((page: BridgePage) => void) | undefined
  onInvalid?: ((errors: ValidationErrors, error: BridgeError['error']) => void) | undefined
  onError?: ((error: BridgeError['error']) => void) | undefined
  onException?: ((exception: VisitException) => void) | undefined
  onCancel?: (() => void) | undefined
  onFinish?: ((visit: Visit) => void) | undefined
}

export interface Visit {
  id: number
  url: URL
  method: Method
  data: Record<string, unknown> | FormData
  headers: Record<string, string>
  replace: boolean
  preserveState: boolean
  preserveScroll: boolean
  only: string[]
  except: string[]
  prefetch: boolean
  completed: boolean
  cancelled: boolean
  controller: AbortController
}

export interface VisitException {
  kind: 'network' | 'invalid-response'
  visit: Visit
  error?: unknown
  status?: number | undefined
  contentType?: string | null | undefined
  body?: string | undefined
  /** Call to suppress the default handling (full document load). */
  preventDefault(): void
}

export type VisitOutcome =
  | { status: 'success'; page: BridgePage }
  | { status: 'invalid'; errors: ValidationErrors; error: BridgeError['error'] }
  | { status: 'error'; error: BridgeError['error'] }
  | { status: 'exception'; exception: VisitException }
  | { status: 'cancelled' }
  | { status: 'redirected' }

export interface RouterEvents extends Record<string, unknown> {
  before: Visit
  start: Visit
  progress: { visit: Visit; progress: UploadProgress }
  success: { visit: Visit; page: BridgePage }
  invalid: { visit: Visit; errors: ValidationErrors; error: BridgeError['error'] }
  error: { visit: Visit; error: BridgeError['error'] }
  exception: VisitException
  finish: Visit
  navigate: { page: BridgePage; visit: Visit | null }
  cancel: Visit
}
