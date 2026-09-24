import type { BridgePage } from '@swarakaka/bridge-protocol'
import { PageCache } from './cache/PageCache.js'
import { DEFAULT_CONFIG, type BridgeConfig } from './config.js'
import { readBuild, readEmbeddedPage } from './dom.js'
import { Emitter } from './events/Emitter.js'
import { Form, type FormData_, type FormOptions } from './forms/createForm.js'
import { RequestManager } from './http/RequestManager.js'
import { JsonClient } from './json/JsonClient.js'
import { JsonRequest, type JsonHandleOptions } from './json/JsonRequest.js'
import { PageStore } from './pages/PageStore.js'
import { History } from './router/History.js'
import { Router } from './router/Router.js'
import type { RouterEvents } from './router/Visit.js'
import { StreamClient, type StreamOptions } from './stream/StreamClient.js'

export interface Bridge {
  readonly store: PageStore
  readonly router: Router
  readonly http: RequestManager
  /** JSON-mode client: the same routes with `Accept: application/json`, no navigation. */
  readonly json: JsonClient
  readonly history: History
  readonly cache: PageCache
  readonly events: Emitter<RouterEvents>
  readonly config: BridgeConfig
  build: string | null
  on: Emitter<RouterEvents>['on']
  form<T extends FormData_>(initial: T, options?: FormOptions): Form<T>
  /** A stateful JSON-mode request handle (what `useJson` wraps). */
  jsonRequest<T = unknown>(options?: JsonHandleOptions): JsonRequest<T>
  /** Open an SSE stream (fetch transport by default). */
  stream(url: string, options?: StreamOptions): StreamClient
  /** Fetch the page for the current URL when no page was embedded (static shell mode). */
  bootstrap(): Promise<BridgePage | null>
  init(): void
  destroy(): void
}

let current: Bridge | null = null

export function createBridge(config: BridgeConfig = {}): Bridge {
  const win = config.window ?? (typeof window === 'undefined' ? null : window)
  const doc = win?.document
  const initialPage =
    config.initialPage !== undefined ? config.initialPage : doc ? readEmbeddedPage(doc) : null
  let build =
    config.build !== undefined
      ? config.build
      : ((doc ? readBuild(doc) : null) ?? initialPage?.build ?? null)

  const events = new Emitter<RouterEvents>()
  const store = new PageStore(initialPage)
  const http = new RequestManager({ fetch: config.fetch, credentials: config.credentials })
  const history = new History({ window: win ?? undefined })
  const cache = new PageCache({
    ttl: config.cache?.ttl ?? DEFAULT_CONFIG.cache.ttl,
    staleWhileRevalidate:
      config.cache?.staleWhileRevalidate ?? DEFAULT_CONFIG.cache.staleWhileRevalidate,
  })
  const json = new JsonClient(http, () => cache.clear())

  const router = new Router({
    store,
    http,
    history,
    cache,
    events,
    build: () => bridge.build,
    window: win,
    reloadDebounce: config.reloadDebounce ?? DEFAULT_CONFIG.reloadDebounce,
    hardReloadOnError: config.hardReloadOnError ?? DEFAULT_CONFIG.hardReloadOnError,
    allowExternalNavigate: config.allowExternalNavigate ?? DEFAULT_CONFIG.allowExternalNavigate,
    prepare: config.prepare,
  })

  // Keep the build id in sync with what the server reports.
  events.on('navigate', ({ page }) => {
    if (page.build) build = page.build
    bridge.build = build
  })

  const bridge: Bridge = {
    store,
    router,
    http,
    json,
    history,
    cache,
    events,
    config,
    build,
    on: events.on.bind(events),
    form: (initial, options) => new Form(router, initial, options),
    jsonRequest: (options) => new JsonRequest(json, options),
    stream: (url, options = {}) =>
      new StreamClient(url, { fetch: config.fetch, ...options }, { store, router, window: win }),
    bootstrap: async () => {
      if (store.page || !win) return store.page
      const outcome = await router.visit(win.location.href, { replace: true, useCache: false })
      return outcome.status === 'success' ? outcome.page : null
    },
    init: () => router.init(),
    destroy: () => {
      router.destroy()
      if (current === bridge) current = null
    },
  }

  current = bridge
  return bridge
}

/** The most recently created Bridge instance, for code outside component trees. */
export function getBridge(): Bridge {
  if (!current)
    throw new Error('Bridge has not been created. Call createBridge() or createBridgeApp() first.')
  return current
}

/** Lazy proxy to the current instance's router: `router.visit('/customers')`. */
export const router: Router = new Proxy({} as Router, {
  get(_, prop) {
    const target = getBridge().router as unknown as Record<string | symbol, unknown>
    const value = target[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(getBridge().router)
      : value
  },
})
