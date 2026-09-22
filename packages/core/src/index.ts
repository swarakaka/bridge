/**
 * @swarakaka/bridge-core — framework-agnostic client runtime (PLAN §10).
 */
export { createBridge, getBridge, router } from './createBridge'
export type { Bridge } from './createBridge'
export type { BridgeConfig } from './config'
export { DEFAULT_CONFIG } from './config'
export { Emitter } from './events/Emitter'
export type { Listener } from './events/Emitter'
export { RequestManager } from './http/RequestManager'
export type {
  HttpRequest,
  PreparedRequest,
  UploadProgress,
  RequestManagerOptions,
} from './http/RequestManager'
export { parseResponse, isBridgeContentType } from './http/responseParser'
export type { HttpResponse, ParsedResponse } from './http/responseParser'
export { readXsrfToken } from './http/csrf'
export { hasFiles, objectToFormData } from './http/formData'
export { PageStore } from './pages/PageStore'
export type { PageState, PageListener, SetPageOptions } from './pages/PageStore'
export { mergeValue, setDeep, getDeep, hasDeep, isPlainObject } from './pages/merge'
export type { MergeMode } from './pages/merge'
export { PageCache } from './cache/PageCache'
export type { PageCacheOptions, CacheLookup, CacheEntry } from './cache/PageCache'
export { History, isHistoryState } from './router/History'
export type { HistoryState, ScrollPositions } from './router/History'
export { captureScroll, restoreScroll, resetScroll, SCROLL_REGION_ATTRIBUTE } from './router/Scroll'
export { Router } from './router/Router'
export type { RouterDependencies, ReloadOptions } from './router/Router'
export { isSameOrigin, relativeUrl, mergeQuery, toUrl, stripHash } from './router/url'
export type { Method } from './router/url'
export type {
  VisitOptions,
  Visit,
  VisitException,
  VisitOutcome,
  RouterEvents,
  ValidationErrors,
} from './router/Visit'
export { Form } from './forms/createForm'
export type { FormOptions, SubmitOptions } from './forms/createForm'
export { readEmbeddedPage, readBuild, readMeta } from './dom'
export { StreamClient } from './stream/StreamClient'
export type { StreamOptions, StreamState, StreamEvents } from './stream/StreamClient'
export { SseParser } from './stream/sseParser'
export type { SseEvent } from './stream/sseParser'
export { Backoff } from './stream/backoff'
export type { BackoffOptions } from './stream/backoff'
export {
  PROTOCOL_VERSION,
  PAGE_ACCEPT,
  MEDIA_TYPES,
  HEADERS,
  CONTROL_EVENT,
  EMBEDDED_PAGE_ID,
  VARY,
  isPage,
  isError,
  isControlEvent,
  parseBridgeContentType,
} from '@swarakaka/bridge-protocol'
export type {
  BridgePage,
  BridgeError,
  BridgeStreamControl,
  BridgeJsonDocument,
} from '@swarakaka/bridge-protocol'
