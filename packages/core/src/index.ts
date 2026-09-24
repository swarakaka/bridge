/**
 * @swarakaka/bridge-core — framework-agnostic client runtime (PLAN §10).
 */
export { createBridge, getBridge, router } from './createBridge.js'
export type { Bridge } from './createBridge.js'
export type { BridgeConfig } from './config.js'
export { DEFAULT_CONFIG } from './config.js'
export { Emitter } from './events/Emitter.js'
export type { Listener } from './events/Emitter.js'
export { RequestManager } from './http/RequestManager.js'
export type {
  HttpRequest,
  PreparedRequest,
  UploadProgress,
  RequestManagerOptions,
} from './http/RequestManager.js'
export { parseResponse, isBridgeContentType } from './http/responseParser.js'
export type { HttpResponse, ParsedResponse } from './http/responseParser.js'
export { readXsrfToken } from './http/csrf.js'
export { JsonClient, JSON_ACCEPT, kindFor, firstErrors } from './json/JsonClient.js'
export type {
  JsonMeta,
  JsonError,
  JsonErrorKind,
  JsonOutcome,
  JsonRequestOptions,
} from './json/JsonClient.js'
export { JsonRequest } from './json/JsonRequest.js'
export { JsonForm } from './json/JsonForm.js'
export type {
  JsonFormOptions,
  JsonFormTransport,
  JsonSubmitOptions,
  JsonValidateOptions,
} from './json/JsonForm.js'
export type { JsonHandleOptions, JsonCallOptions } from './json/JsonRequest.js'
export { hasFiles, objectToFormData } from './http/formData.js'
export { PageStore, readMergeKeys, appendProp } from './pages/PageStore.js'
export type { PageState, PageListener, SetPageOptions } from './pages/PageStore.js'
export { requireResolver } from './pages/resolver.js'
export type { PagesOption } from './pages/resolver.js'
export { mergeValue, setDeep, getDeep, hasDeep, isPlainObject } from './pages/merge.js'
export type { MergeMode } from './pages/merge.js'
export { PageCache } from './cache/PageCache.js'
export type { PageCacheOptions, CacheLookup, CacheEntry } from './cache/PageCache.js'
export { History, isHistoryState } from './router/History.js'
export type { HistoryState, ScrollPositions } from './router/History.js'
export {
  captureScroll,
  restoreScroll,
  resetScroll,
  SCROLL_REGION_ATTRIBUTE,
} from './router/Scroll.js'
export { Router } from './router/Router.js'
export type { RouterDependencies, ReloadOptions } from './router/Router.js'
export { isSameOrigin, relativeUrl, mergeQuery, toUrl, stripHash } from './router/url.js'
export type { QueryStringArrayFormat } from './router/url.js'
export type { Method } from './router/url.js'
export type {
  VisitOptions,
  Visit,
  VisitException,
  VisitOutcome,
  RouterEvents,
  ValidationErrors,
} from './router/Visit.js'
export { Form } from './forms/createForm.js'
export type {
  FormOptions,
  PageFormTransport,
  SubmitOptions,
  ValidateOptions,
} from './forms/createForm.js'
export { FormState } from './forms/FormState.js'
export type { FormData_, FormTransport, FormValidateOptions } from './forms/FormState.js'
export { readEmbeddedPage, readBuild, readMeta } from './dom.js'
export { StreamClient } from './stream/StreamClient.js'
export type { StreamOptions, StreamState, StreamEvents } from './stream/StreamClient.js'
export { SseParser } from './stream/sseParser.js'
export type { SseEvent } from './stream/sseParser.js'
export { Backoff } from './stream/backoff.js'
export type { BackoffOptions } from './stream/backoff.js'
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
export { HEAD_ATTRIBUTE, HeadManager, createHeadData, renderHead } from './head.js'
export type { HeadData } from './head.js'
