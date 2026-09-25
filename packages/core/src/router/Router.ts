import type { BridgeError, BridgePage } from '@swarakaka/bridge-protocol'
import { PageCache } from '../cache/PageCache.js'
import type { Emitter } from '../events/Emitter.js'
import type { ClientIdentity } from '../http/clientIdentity.js'
import type { RequestManager } from '../http/RequestManager.js'
import { parseResponse, type ParsedResponse } from '../http/responseParser.js'
import type { OnceStore } from '../pages/OnceStore.js'
import type { MergeOption, OptimisticSettle, PageStore } from '../pages/PageStore.js'
import { readWatch, watchingProps } from '../pages/watch.js'
import type { History, HistoryState, StoredHistoryState } from './History.js'
import { createPoll, type PollHandle, type PollOptions } from './poll.js'
import { captureScroll, resetScroll, restoreScroll } from './Scroll.js'
import { isSameOrigin, relativeUrl, toUrl } from './url.js'
import type {
  RouterEvents,
  ValidationErrors,
  Visit,
  VisitException,
  VisitOptions,
  VisitOutcome,
} from './Visit.js'

export interface RouterDependencies {
  store: PageStore
  http: RequestManager
  history: History
  cache: PageCache
  /** Values of once props (PLAN §13.2). */
  once: OnceStore
  events: Emitter<RouterEvents>
  build: () => string | null
  window: Window | null
  reloadDebounce: number
  hardReloadOnError: boolean
  allowExternalNavigate: boolean
  /** Called with a page before it is applied, e.g. to load its component. */
  prepare?: ((page: BridgePage) => Promise<void> | void) | undefined
  /** The identity `http` sends; lets the router recognise its own changes (PLAN §20.6). */
  identity?: ClientIdentity | undefined
  /** Upper bound in ms of a random delay before reloading watched props for another client's change. */
  watchSpread?: number | undefined
  /** Whether a stream applying control events is open; pages with watched props warn without one. */
  hasStream?: (() => boolean) | undefined
}

export interface InvalidateTagsOptions {
  /** Prop keys to reload as well (the message's `keys`). */
  keys?: string[] | undefined
  /** The message's `client` member: `<hash>.<seq>` of the request that made the change. */
  client?: string | undefined
}

export interface ReloadOptions {
  only?: string[] | undefined
  except?: string[] | undefined
  headers?: Record<string, string> | undefined
  preserveScroll?: boolean | undefined
  /**
   * Combine merge props instead of replacing them (see `VisitOptions.merge`).
   * Coalesced reloads merge only when every caller asked for the same value.
   */
  merge?: MergeOption | undefined
  /** `false` marks the reload as background work (`visit.showProgress`); combined reloads show progress if any caller wants it. */
  showProgress?: boolean | undefined
  onSuccess?: ((page: BridgePage) => void) | undefined
  onFinish?: (() => void) | undefined
}

interface PendingReload {
  component: string | null
  only: Set<string> | null
  except: Set<string>
  headers: Record<string, string>
  preserveScroll: boolean
  showProgress: boolean
  /** undefined until the first caller; a disagreement between callers means no merge. */
  merge: MergeOption | undefined
  resolvers: Array<(outcome: VisitOutcome) => void>
  callbacks: ReloadOptions[]
}

/**
 * Navigation engine: visits, partial reloads, deferred props, prefetch,
 * history and scroll (PLAN §11).
 */
export class Router {
  private activeVisit: Visit | null = null
  private activeIsReload = false
  private deferredControllers = new Set<AbortController>()
  private visitId = 0
  /** Optimistic tokens of visits that have not settled yet (PLAN §14.3). */
  private optimisticVisits = new Map<Visit, number>()
  private pendingReload: PendingReload | null = null
  private reloadTimer: ReturnType<typeof setTimeout> | null = null
  private unlistenHistory: (() => void) | null = null
  private unlistenScroll: (() => void) | null = null
  private unlistenPageShow: (() => void) | null = null
  private readonly invalidationHandlers = new Map<string, () => Promise<void> | void>()
  private restoreId = 0
  /**
   * The request (`X-Bridge-Client` number) whose response last delivered each
   * top-level prop of the current page. Props filled from elsewhere (history,
   * once store, cache, patches) have no entry.
   */
  private readonly deliveries = new Map<string, number>()
  private readonly warnedWatch = new Set<string>()
  private readonly d: RouterDependencies

  constructor(deps: RouterDependencies) {
    this.d = deps
  }

  /** Registers history listeners and records the initial entry. Call once after the page is available. */
  init(): void {
    const page = this.d.store.page
    if (page) {
      this.applyHistoryMeta(page)
      // An embedded page always carries its once values: remember them.
      this.d.once.complete(page)
    }
    // After a full reload of an encrypted page the entry is sealed: its remembered
    // state can only be read asynchronously, once the entry below replaced it.
    const previous = this.d.window ? this.d.history.raw() : null
    // Always record the page we booted with: after a full reload the entry still
    // holds the page from before it, which back/forward would otherwise restore.
    if (page && this.d.window) this.d.history.push(page, this.d.store.current.key, true)
    if (previous?.sealed) void this.restoreSealedRemember(previous)
    this.unlistenHistory = this.d.history.listen((state) => this.onPopState(state))
    this.unlistenScroll = this.trackScroll()
    this.unlistenPageShow = this.trackPageShow()
    if (page) {
      this.warnWithoutStream(page)
      void this.loadDeferred(page)
    }
  }

  destroy(): void {
    this.unlistenHistory?.()
    this.unlistenScroll?.()
    this.unlistenPageShow?.()
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = null
    this.cancelActive()
    this.cancelDeferred()
  }

  get page(): BridgePage | null {
    return this.d.store.page
  }

  visit(url: string | URL, options: VisitOptions = {}): Promise<VisitOutcome> {
    return this.performVisit(url, options, false)
  }

  get(
    url: string | URL,
    data?: Record<string, unknown>,
    options: VisitOptions = {},
  ): Promise<VisitOutcome> {
    return this.visit(url, { ...options, method: 'get', data })
  }

  post(
    url: string | URL,
    data?: VisitOptions['data'],
    options: VisitOptions = {},
  ): Promise<VisitOutcome> {
    return this.visit(url, { ...options, method: 'post', data })
  }

  put(
    url: string | URL,
    data?: VisitOptions['data'],
    options: VisitOptions = {},
  ): Promise<VisitOutcome> {
    return this.visit(url, { ...options, method: 'put', data })
  }

  patch(
    url: string | URL,
    data?: VisitOptions['data'],
    options: VisitOptions = {},
  ): Promise<VisitOutcome> {
    return this.visit(url, { ...options, method: 'patch', data })
  }

  delete(url: string | URL, options: VisitOptions = {}): Promise<VisitOutcome> {
    return this.visit(url, { ...options, method: 'delete' })
  }

  /**
   * Partial reload of the current page. Calls within the debounce window are
   * coalesced into one request (needed for stream invalidations).
   */
  reload(options: ReloadOptions = {}): Promise<VisitOutcome> {
    return new Promise((resolve) => {
      const pending = (this.pendingReload ??= {
        component: this.d.store.page?.component ?? null,
        only: new Set(),
        except: new Set(),
        headers: {},
        preserveScroll: true,
        showProgress: false,
        merge: undefined,
        resolvers: [],
        callbacks: [],
      })

      if (!options.only || options.only.length === 0) pending.only = null
      else if (pending.only) options.only.forEach((k) => pending.only!.add(k))
      options.except?.forEach((k) => pending.except.add(k))
      Object.assign(pending.headers, options.headers ?? {})
      if (options.preserveScroll === false) pending.preserveScroll = false
      if (options.showProgress !== false) pending.showProgress = true
      const merge = options.merge ?? false
      pending.merge = pending.resolvers.length === 0 || pending.merge === merge ? merge : false
      pending.resolvers.push(resolve)
      pending.callbacks.push(options)

      if (this.reloadTimer) clearTimeout(this.reloadTimer)
      this.reloadTimer = setTimeout(() => void this.flushReload(), this.d.reloadDebounce)
    })
  }

  /**
   * Reloads the current page every `interval` ms (PLAN §11.1):
   * `router.poll(5000, { only: ['queue'] })`. Pauses in hidden tabs unless
   * `keepAlive`, and stops when another page is shown unless `bindToPage: false`.
   * Streams push changes without polling; prefer them where they are deployed.
   */
  poll(
    interval: number,
    reload: ReloadOptions | (() => ReloadOptions) = {},
    options: PollOptions = {},
  ): PollHandle {
    return createPoll(
      { router: this, store: this.d.store, window: this.d.window },
      interval,
      reload,
      options,
    )
  }

  /**
   * Reload the given prop keys ("*" reloads everything present on the page).
   * Props with an invalidation handler (`handleInvalidation`) are passed to it
   * instead of being reloaded.
   */
  invalidate(keys: string[] | '*'): Promise<VisitOutcome> | null {
    const page = this.d.store.page
    if (!page) return null
    // Cached pages may hold the data that just changed.
    this.d.cache.clear()
    const named = (prop: string): boolean =>
      keys === '*' || keys.some((key) => key.split('.')[0] === prop)
    const handled = Array.from(this.invalidationHandlers.keys()).filter(
      (prop) => named(prop) && this.d.store.hasProp(prop),
    )
    for (const prop of handled) void this.invalidationHandlers.get(prop)!()
    if (keys === '*') return this.reload(handled.length > 0 ? { except: handled } : {})
    const present = keys.filter((key) => {
      const prop = key.split('.')[0]!
      return this.d.store.hasProp(prop) && !handled.includes(prop)
    })
    if (present.length === 0) return null
    return this.reload({ only: present })
  }

  /**
   * Reloads the props of the current page that watch any of `tags` (stream
   * `invalidate` messages with `tags`, PLAN §20.6), together with `keys`.
   * When `client` names this client, the props its own response to that
   * request (or a later one) already delivered are not reloaded.
   */
  async invalidateTags(
    tags: string[],
    options: InvalidateTagsOptions = {},
  ): Promise<VisitOutcome | null> {
    const keys = options.keys ?? []
    const own =
      options.client !== undefined && this.d.identity ? this.d.identity.own(options.client) : null

    if (own !== null) {
      // The request's own page may still be on its way: decide once it is applied.
      await this.whenApplied(own)
    } else if ((this.d.watchSpread ?? 0) > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * this.d.watchSpread!))
    }

    const watching = watchingProps(this.d.store.page, tags).filter(
      (prop) => !keys.includes(prop) && (own === null || !this.deliveredSince(prop, own)),
    )
    const all = [...keys, ...watching]
    if (all.length === 0) {
      // Nothing on this page to reload, but cached pages may hold the data.
      this.d.cache.clear()
      return null
    }
    return this.invalidate(all)
  }

  /**
   * Takes over invalidation of one prop: `invalidate()` (and stream
   * `invalidate` events) call `handler` instead of reloading it. Infinite
   * scroll uses this to re-fetch every loaded page. Returns an unregister function.
   */
  handleInvalidation(prop: string, handler: () => Promise<void> | void): () => void {
    this.invalidationHandlers.set(prop, handler)
    return () => {
      if (this.invalidationHandlers.get(prop) === handler) this.invalidationHandlers.delete(prop)
    }
  }

  /** Server-initiated navigation (stream `navigate` control event). */
  navigate(url: string, replace = false): Promise<VisitOutcome> | null {
    if (!isSameOrigin(url) && !this.d.allowExternalNavigate) return null
    return this.visit(url, { replace })
  }

  /** Warms the page cache; `cacheTags` label the entry for `flushByCacheTags`. */
  async prefetch(
    url: string | URL,
    options: Pick<VisitOptions, 'only' | 'except' | 'headers'> & {
      cacheTags?: string | string[] | undefined
    } = {},
  ): Promise<void> {
    const target = toUrl(url)
    if (!isSameOrigin(target)) return
    const key = PageCache.key(relativeUrl(target), options.only, options.except)
    if (this.d.cache.get(key).state === 'fresh') return
    try {
      const response = await this.d.http.send({
        method: 'get',
        url: target,
        only: options.only,
        except: options.except,
        headers: options.headers,
        component: this.d.store.page?.component,
        build: this.d.build(),
        once: this.d.once.heldKeys(),
        prefetch: true,
      })
      const parsed = await parseResponse(response)
      if (parsed.kind === 'page') this.d.cache.set(key, parsed.page, tagList(options.cacheTags))
    } catch {
      // Prefetch failures are silent by design.
    }
  }

  back(): void {
    this.d.history.back()
  }

  remember(key: string, value: unknown): void {
    this.d.history.remember(key, value)
  }

  restore<T>(key: string): T | undefined {
    return this.d.history.restore<T>(key)
  }

  /**
   * Visits with an optimistic update: `router.optimistic((props) => ({ likes: props.likes + 1 })).post(url)`.
   * The patch shows at once and is undone if the visit fails (PLAN §14.3).
   */
  optimistic(update: NonNullable<VisitOptions['optimistic']>): OptimisticVisits {
    const withUpdate = (options: VisitOptions = {}): VisitOptions => ({
      ...options,
      optimistic: update,
    })
    return {
      visit: (url, options) => this.visit(url, withUpdate(options)),
      get: (url, data, options) => this.get(url, data, withUpdate(options)),
      post: (url, data, options) => this.post(url, data, withUpdate(options)),
      put: (url, data, options) => this.put(url, data, withUpdate(options)),
      patch: (url, data, options) => this.patch(url, data, withUpdate(options)),
      delete: (url, options) => this.delete(url, withUpdate(options)),
    }
  }

  /**
   * Replaces top-level props with server values without a request, for
   * example from a JSON-mode response. Props held by a pending optimistic
   * update change once it settles. History stores the new values.
   */
  patchProps(patch: Record<string, unknown>): void {
    // Not delivered by a page response: freshness against a change is unknown.
    for (const key of Object.keys(patch)) this.deliveries.delete(key)
    this.d.store.patchProps(patch)
    if (this.d.window && this.d.store.serverPage) this.d.history.updatePage(this.d.store.serverPage)
  }

  /** Drops cached pages and stored once values; call it when the user changes (logout). */
  clearCache(): void {
    this.d.cache.clear()
    this.d.once.clear()
  }

  /** Removes cached pages carrying any of these tags (set by `prefetch({ cacheTags })`). */
  flushByCacheTags(tags: string | string[]): void {
    this.d.cache.flushTags(tagList(tags))
  }

  cancel(): void {
    this.cancelActive()
  }

  /**
   * A page-protocol request outside the visit pipeline: it neither cancels nor
   * waits for the active visit, emits no router events and never swaps the
   * page. Precognition validation uses it.
   */
  async request(
    url: string | URL,
    options: {
      method?: VisitOptions['method']
      data?: VisitOptions['data']
      headers?: Record<string, string> | undefined
      /** Partial selection, sent with `X-Bridge-Component` for the current page. */
      only?: string[] | undefined
      signal?: AbortSignal | undefined
    } = {},
  ): Promise<ParsedResponse> {
    const response = await this.d.http.send({
      method: options.method ?? 'get',
      url: toUrl(url),
      data: options.data,
      headers: options.headers,
      only: options.only,
      component: this.d.store.page?.component,
      build: this.d.build(),
      signal: options.signal,
    })
    return parseResponse(response)
  }

  // ---------------------------------------------------------------------------

  private async flushReload(): Promise<void> {
    this.reloadTimer = null

    // A background reload must not abort the user's navigation or submit: wait for it.
    if (this.activeVisit && !this.activeIsReload) {
      this.reloadTimer = setTimeout(
        () => void this.flushReload(),
        Math.max(this.d.reloadDebounce, 10),
      )
      return
    }

    const pending = this.pendingReload
    this.pendingReload = null
    if (!pending) return

    // A navigation that finished meanwhile left the page the reload was meant for.
    if ((this.d.store.page?.component ?? null) !== pending.component) {
      pending.callbacks.forEach((c) => c.onFinish?.())
      pending.resolvers.forEach((resolve) => resolve({ status: 'cancelled' }))
      return
    }

    const page = this.d.store.page
    const url = page ? page.url : (this.d.window?.location.href ?? '/')

    const outcome = await this.performVisit(
      url,
      {
        only: pending.only ? Array.from(pending.only) : undefined,
        except: pending.only ? undefined : Array.from(pending.except),
        headers: pending.headers,
        preserveState: true,
        preserveScroll: pending.preserveScroll,
        showProgress: pending.showProgress,
        merge: pending.merge ?? false,
        replace: true,
        useCache: false,
        onSuccess: (p) => pending.callbacks.forEach((c) => c.onSuccess?.(p)),
        onFinish: () => pending.callbacks.forEach((c) => c.onFinish?.()),
      },
      true,
    )
    pending.resolvers.forEach((resolve) => resolve(outcome))
  }

  private buildVisit(url: string | URL, options: VisitOptions): Visit {
    return {
      id: ++this.visitId,
      url: toUrl(url),
      method: options.method ?? 'get',
      data: options.data ?? {},
      headers: options.headers ?? {},
      replace: options.replace ?? false,
      preserveState: options.preserveState ?? false,
      preserveScroll: options.preserveScroll ?? false,
      only: options.only ?? [],
      except: options.except ?? [],
      merge: options.merge ?? false,
      showProgress: options.showProgress ?? true,
      preserveUrl: options.preserveUrl ?? false,
      prefetch: false,
      completed: false,
      cancelled: false,
      controller: new AbortController(),
    }
  }

  private async performVisit(
    url: string | URL,
    options: VisitOptions,
    isReload: boolean,
  ): Promise<VisitOutcome> {
    const visit = this.buildVisit(url, options)
    const outcome = await this.sendVisit(visit, options, isReload)
    // Every way a visit can end without applying a page shows the server values again.
    this.settleOptimistic(visit, 'server')
    return outcome
  }

  private async sendVisit(
    visit: Visit,
    options: VisitOptions,
    isReload: boolean,
  ): Promise<VisitOutcome> {
    if (!isSameOrigin(visit.url)) {
      this.hardNavigate(visit.url.href)
      return { status: 'redirected' }
    }

    if (options.onBefore?.(visit) === false || !this.d.events.emit('before', visit)) {
      return { status: 'cancelled' }
    }

    this.cancelActive()
    if (!isReload) this.cancelDeferred()
    this.activeVisit = visit
    this.activeIsReload = isReload

    if (options.optimistic && this.d.store.page) {
      const patch = options.optimistic({ ...(this.d.store.page.props as Record<string, unknown>) })
      const token = this.d.store.applyOptimistic(patch)
      if (token !== null) this.optimisticVisits.set(visit, token)
    }

    const isGet = visit.method === 'get'
    const cacheable =
      isGet &&
      options.useCache !== false &&
      !(visit.data instanceof FormData) &&
      Object.keys(visit.data).length === 0
    const cacheKey = PageCache.key(relativeUrl(visit.url), visit.only, visit.except)

    if (cacheable) {
      const lookup = this.d.cache.get(cacheKey)
      if (lookup.state === 'fresh') {
        const { page, missing } = this.d.once.complete(lookup.entry.page)
        await this.prepare(page)
        if (visit.cancelled) {
          this.finish(visit, options)
          return { status: 'cancelled' }
        }
        this.applyPage(page, visit)
        this.reloadMissingOnce(missing)
        this.settleOptimistic(visit, 'server')
        this.flushInvalidated(options)
        this.finish(visit, options)
        options.onSuccess?.(page)
        return { status: 'success', page }
      }
      if (lookup.state === 'stale') {
        const { page } = this.d.once.complete(lookup.entry.page)
        await this.prepare(page)
        if (visit.cancelled) {
          this.finish(visit, options)
          return { status: 'cancelled' }
        }
        // The revalidating request below fetches anything the store could not fill.
        this.applyPage(page, visit)
        visit.preserveState = true
        visit.preserveScroll = true
        visit.replace = true
      }
    }

    this.d.events.emit('start', visit)
    options.onStart?.(visit)

    let parsed: ParsedResponse
    let seq: number | undefined
    try {
      const response = await this.d.http.send({
        method: visit.method,
        url: visit.url,
        data: visit.data,
        headers: visit.headers,
        only: visit.only,
        except: visit.except,
        component: this.d.store.page?.component,
        build: this.d.build(),
        once: this.d.once.heldKeys(),
        signal: visit.controller.signal,
        forceFormData: options.forceFormData,
        queryStringArrayFormat: options.queryStringArrayFormat,
        onProgress: (progress) => {
          this.d.events.emit('progress', { visit, progress })
          options.onProgress?.(progress)
        },
      })
      seq = response.seq
      parsed = await parseResponse(response)
    } catch (error) {
      if (visit.cancelled || (error instanceof DOMException && error.name === 'AbortError')) {
        options.onCancel?.()
        this.d.events.emit('cancel', visit)
        this.finish(visit, options)
        return { status: 'cancelled' }
      }
      const exception = this.exception({ kind: 'network', visit, error })
      this.finish(visit, options)
      options.onException?.(exception)
      return { status: 'exception', exception }
    }

    if (visit.cancelled) {
      this.finish(visit, options)
      return { status: 'cancelled' }
    }

    const outcome = await this.handleParsed(
      parsed,
      visit,
      options,
      cacheable ? cacheKey : null,
      seq,
    )
    this.finish(visit, options)
    return outcome
  }

  private async handleParsed(
    parsed: ParsedResponse,
    visit: Visit,
    options: VisitOptions,
    cacheKey: string | null,
    seq?: number,
  ): Promise<VisitOutcome> {
    switch (parsed.kind) {
      case 'conflict':
        this.hardNavigate(parsed.location)
        return { status: 'redirected' }

      case 'unsupported':
        this.hardNavigate(visit.url.href)
        return { status: 'redirected' }

      case 'page': {
        // Record once values the server sent and fill in the ones it left out.
        const { page, missing } = this.d.once.complete(parsed.page)
        if (cacheKey && visit.method === 'get') this.d.cache.set(cacheKey, page)
        if (visit.method !== 'get') this.d.cache.clear()
        await this.prepare(page)
        if (visit.cancelled) return { status: 'cancelled' }
        // Once values filled from the store were not delivered by this response.
        this.applyPage(page, visit, { seq, props: Object.keys(parsed.page.props) })
        this.reloadMissingOnce(missing)
        this.settleOptimistic(visit, 'server')
        this.flushInvalidated(options)
        this.d.events.emit('success', { visit, page })
        options.onSuccess?.(page)
        return { status: 'success', page }
      }

      case 'error':
        return this.handleError(parsed.error, visit, options)

      case 'empty':
        // 204/304: nothing to apply (Precognition success, not modified); optimistic values stay.
        this.settleOptimistic(visit, 'keep')
        this.flushInvalidated(options)
        options.onSuccess?.(this.d.store.page as BridgePage)
        return { status: 'success', page: this.d.store.page as BridgePage }

      case 'invalid': {
        const exception = this.exception({
          kind: 'invalid-response',
          visit,
          status: parsed.status,
          contentType: parsed.contentType,
          body: parsed.body,
        })
        options.onException?.(exception)
        return { status: 'exception', exception }
      }
    }
  }

  private handleError(
    error: BridgeError['error'],
    visit: Visit,
    options: VisitOptions,
  ): VisitOutcome {
    if (error.kind === 'validation' || error.status === 422) {
      const errors: ValidationErrors = {}
      for (const [field, messages] of Object.entries(error.errors ?? {}))
        if (messages) errors[field] = messages
      this.d.events.emit('invalid', { visit, errors, error })
      options.onInvalid?.(errors, error)
      return { status: 'invalid', errors, error }
    }

    if (error.status === 401 || error.status === 403 || error.status === 419) {
      // The user or their rights changed: cached pages and once values may belong to someone else.
      this.d.cache.clear()
      this.d.once.clear()
    }

    if (error.kind === 'unauthenticated' && error.redirect) {
      this.d.events.emit('error', { visit, error })
      options.onError?.(error)
      void this.visit(error.redirect, { replace: true })
      return { status: 'error', error }
    }

    if (error.kind === 'csrf') {
      this.d.events.emit('error', { visit, error })
      options.onError?.(error)
      this.hardNavigate(this.d.window?.location.href ?? visit.url.href)
      return { status: 'error', error }
    }

    const handled = !this.d.events.emit('error', { visit, error })
    options.onError?.(error)

    if (!handled) {
      if (this.d.hardReloadOnError && visit.method === 'get') {
        this.hardNavigate(visit.url.href)
      } else {
        this.d.store.setError({ status: error.status, kind: error.kind, message: error.message })
      }
    }

    return { status: 'error', error }
  }

  private exception(partial: Omit<VisitException, 'preventDefault'>): VisitException {
    let prevented = false
    const exception: VisitException = { ...partial, preventDefault: () => (prevented = true) }
    this.d.events.emit('exception', exception)

    if (!prevented && partial.kind === 'invalid-response') {
      if (partial.visit.method === 'get') {
        this.hardNavigate(partial.visit.url.href)
      } else {
        this.d.store.setError({
          status: partial.status ?? 0,
          kind: 'invalid_response',
          message: 'The server returned a non-Bridge response.',
        })
      }
    }
    return exception
  }

  private settleOptimistic(visit: Visit, mode: OptimisticSettle): void {
    const token = this.optimisticVisits.get(visit)
    if (token === undefined) return
    this.optimisticVisits.delete(visit)
    this.d.store.settleOptimistic(token, mode)
  }

  /** `invalidateCacheTags` of a visit that succeeded. */
  private flushInvalidated(options: VisitOptions): void {
    if (options.invalidateCacheTags) this.d.cache.flushTags(tagList(options.invalidateCacheTags))
  }

  private applyPage(
    response: BridgePage,
    visit: Visit,
    delivered?: { seq: number | undefined; props: string[] },
  ): void {
    this.applyHistoryMeta(response)
    // preserveUrl: show the new page under the address the user is on.
    const page =
      visit.preserveUrl && this.d.window
        ? { ...response, url: relativeUrl(this.d.window.location.href) }
        : response
    const current = this.d.store.page
    const partial =
      (visit.only.length > 0 || visit.except.length > 0) &&
      current !== null &&
      current.component === page.component

    if (partial) {
      this.d.store.setPage(page, { partial: true, merge: visit.merge })
      this.recordDelivery(delivered)
      this.d.history.updatePage(this.d.store.serverPage!)
      this.d.events.emit('navigate', { page: this.d.store.page!, visit })
      return
    }

    if (current && this.d.window) this.d.history.saveScroll(captureScroll(this.d.window.document))

    this.d.store.setPage(page, { preserveState: visit.preserveState })
    this.deliveries.clear()
    this.recordDelivery(delivered)
    this.warnWithoutStream(page)

    const replace =
      visit.replace ||
      (this.d.window !== null && relativeUrl(page.url) === relativeUrl(this.d.window.location.href))
    this.d.history.push(page, this.d.store.current.key, replace)

    if (!visit.preserveScroll && this.d.window) resetScroll(this.d.window.document, visit.url.hash)

    this.d.events.emit('navigate', { page, visit })
    void this.loadDeferred(page)
  }

  private async loadDeferred(page: BridgePage): Promise<void> {
    // Only groups with a key still missing: a restored history entry may already hold them.
    const groups = page.deferred
      ? Object.values(page.deferred).filter(
          (g): g is [string, ...string[]] =>
            Array.isArray(g) && g.some((key) => !(key in page.props)),
        )
      : []
    if (groups.length === 0) return

    await Promise.all(
      groups.map(async (group) => {
        const keys = Array.from(group)
        const controller = new AbortController()
        this.deferredControllers.add(controller)
        this.d.store.setLoading(keys, true)
        try {
          const response = await this.d.http.send({
            method: 'get',
            url: page.url,
            only: keys,
            component: page.component,
            build: this.d.build(),
            once: this.d.once.heldKeys(),
            signal: controller.signal,
          })
          const parsed = await parseResponse(response)
          const current = this.d.store.page
          if (parsed.kind === 'page' && current && current.component === parsed.page.component) {
            this.applyHistoryMeta(parsed.page)
            this.d.store.setPage(this.d.once.complete(parsed.page).page, { partial: true })
            this.recordDelivery({ seq: response.seq, props: Object.keys(parsed.page.props) })
            this.d.history.updatePage(this.d.store.serverPage!)
          } else if (parsed.kind === 'invalid') {
            console.warn(
              `[bridge] deferred props ${keys.join(', ')} were not loaded: the server answered ${parsed.status} with ${parsed.contentType ?? 'no content type'} instead of a Bridge page. Output printed before the response (PHP notices, debug output) breaks JSON responses.`,
            )
          }
        } catch {
          // Aborted by navigation or failed; the keys simply stay absent.
        } finally {
          this.deferredControllers.delete(controller)
          this.d.store.setLoading(keys, false)
        }
      }),
    )
  }

  private onPopState(stored: StoredHistoryState | null): void {
    const id = ++this.restoreId
    this.cancelActive()
    this.cancelDeferred()

    const opened = stored ? this.d.history.open(stored) : null
    if (opened instanceof Promise) {
      // Sealed entry (PLAN §23.1): decrypt first; a later back/forward wins.
      void opened.then((state) => {
        if (id === this.restoreId && !this.activeVisit) this.restorePopped(state)
      })
      return
    }
    this.restorePopped(opened)
  }

  /** An entry without a readable page (none stored, or its key was replaced) is requested again. */
  private restorePopped(state: HistoryState | null): void {
    if (state?.page) {
      void this.restoreFromHistory(state)
      return
    }

    if (this.d.window)
      void this.visit(this.d.window.location.href, { replace: true, useCache: false })
  }

  /**
   * Restores the remembered state of the sealed entry a full reload replaced
   * (PLAN §23.1): keys written since boot win, and `restore` tells components.
   */
  private async restoreSealedRemember(previous: StoredHistoryState): Promise<void> {
    const entry = this.d.history.raw()?.entry
    const opened = await this.d.history.open(previous)
    // The user moved on (a visit, back/forward) while the entry was decrypted.
    if (!opened || this.d.history.raw()?.entry !== entry) return
    const current = this.d.history.current()?.remember ?? {}
    // Keys written since boot may be the user's: components decide for those.
    for (const [key, value] of Object.entries(opened.remember))
      if (!(key in current)) this.d.history.remember(key, value)
    if (Object.keys(opened.remember).length > 0)
      this.d.events.emit('restore', { values: opened.remember })
  }

  /**
   * `meta.clearHistory` (spec/page.md §10): replace the history key before
   * this page is stored, so every entry encrypted earlier becomes unreadable,
   * and drop cached pages, which may hold the same data.
   */
  private applyHistoryMeta(page: BridgePage): void {
    if (page.meta?.clearHistory !== true) return
    this.d.history.clear()
    this.d.cache.clear()
    this.d.once.clear()
  }

  /**
   * Once props the server left out (this client announced them) but the store
   * no longer has, for example after it was cleared while the request ran.
   */
  private reloadMissingOnce(missing: string[]): void {
    if (missing.length > 0) void this.reload({ only: missing, showProgress: false })
  }

  /**
   * A document restored from the back-forward cache never fires popstate. If it
   * shows an encrypted page whose key was replaced meanwhile (a logout), reload it.
   */
  private trackPageShow(): (() => void) | null {
    const win = this.d.window
    if (!win) return null
    const onPageShow = (event: PageTransitionEvent): void => {
      if (
        event.persisted &&
        this.d.store.page?.meta?.encryptHistory === true &&
        this.d.history.keyReplaced()
      )
        win.location.reload()
    }
    win.addEventListener('pageshow', onPageShow)
    return () => win.removeEventListener('pageshow', onPageShow)
  }

  private async restoreFromHistory(state: HistoryState): Promise<void> {
    const id = this.restoreId
    await this.prepare(state.page)
    // A later back/forward (or a visit) superseded this one while its component loaded.
    if (id !== this.restoreId || this.activeVisit) return
    this.d.store.setPage(state.page, { preserveState: false })
    this.deliveries.clear()
    if (this.d.window) restoreScroll(state.scroll, this.d.window.document)
    this.d.events.emit('navigate', { page: state.page, visit: null })
    // Deferred groups that never arrived before the user left are fetched now.
    void this.loadDeferred(state.page)
  }

  /**
   * Keeps the current entry's scroll position up to date while the user scrolls,
   * since the entry being left can no longer be written once popstate fires.
   */
  private trackScroll(): (() => void) | null {
    const win = this.d.window
    if (!win) return null
    // Trailing debounce: browsers rate-limit replaceState (Safari throws past ~100 per 10 s).
    let timer: ReturnType<typeof setTimeout> | null = null
    const onScroll = (): void => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        this.d.history.saveScroll(captureScroll(win.document))
      }, 150)
    }
    win.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      win.removeEventListener('scroll', onScroll, { capture: true })
      if (timer !== null) clearTimeout(timer)
    }
  }

  private recordDelivery(
    delivered: { seq: number | undefined; props: string[] } | undefined,
  ): void {
    if (delivered?.seq === undefined) return
    for (const prop of delivered.props) this.deliveries.set(prop, delivered.seq)
  }

  /**
   * Whether the value of `prop` came from the response to request `seq`, or
   * from a request started after `seq` settled (spec/stream.md §3.2).
   */
  private deliveredSince(prop: string, seq: number): boolean {
    const by = this.deliveries.get(prop)
    if (by === undefined || !this.d.identity) return false
    return by === seq || this.d.identity.startedAfterSettled(by, seq)
  }

  /**
   * Resolves once request `seq` settled and no visit is being applied, so its
   * page (if any) is in the store. Gives up after 30 s; the caller then
   * reloads what the request did not deliver.
   */
  private whenApplied(seq: number): Promise<void> {
    const identity = this.d.identity
    const deadline = Date.now() + 30_000
    const step = Math.max(this.d.reloadDebounce, 10)
    return new Promise((resolve) => {
      const check = (): void => {
        const pending = identity !== undefined && identity.known(seq) && !identity.settled(seq)
        const applying = this.activeVisit !== null && !this.activeIsReload
        if ((!pending && !applying) || Date.now() >= deadline) resolve()
        else setTimeout(check, step)
      }
      check()
    })
  }

  /**
   * A page with watched props only updates while a stream applies control
   * events. Warn once per component when none is open a few seconds after it shows.
   */
  private warnWithoutStream(page: BridgePage): void {
    const hasStream = this.d.hasStream
    if (!hasStream || !this.d.window || this.warnedWatch.has(page.component)) return
    if (Object.keys(readWatch(page)).length === 0) return
    setTimeout(() => {
      if (this.d.store.page?.component !== page.component || hasStream()) return
      if (this.warnedWatch.has(page.component)) return
      this.warnedWatch.add(page.component)
      console.warn(
        `[bridge] ${page.component} has watched props, but no stream is open to report changes: open one with useStream() (handleControl on) that subscribes to the channels its models publish on.`,
      )
    }, 3000)
  }

  private async prepare(page: BridgePage): Promise<void> {
    if (!this.d.prepare) return
    try {
      await this.d.prepare(page)
    } catch (error) {
      console.error('[bridge] failed to prepare page', page.component, error)
    }
  }

  private cancelActive(): void {
    if (this.activeVisit && !this.activeVisit.completed) {
      this.activeVisit.cancelled = true
      this.activeVisit.controller.abort()
    }
    this.activeVisit = null
  }

  private cancelDeferred(): void {
    for (const controller of this.deferredControllers) controller.abort()
    this.deferredControllers.clear()
  }

  private finish(visit: Visit, options: VisitOptions): void {
    if (visit.completed) return
    visit.completed = true
    if (this.activeVisit === visit) this.activeVisit = null
    this.d.events.emit('finish', visit)
    options.onFinish?.(visit)
  }

  private hardNavigate(url: string): void {
    if (this.d.window) this.d.window.location.href = url
  }
}

function tagList(tags: string | string[] | undefined): string[] {
  return tags === undefined ? [] : Array.isArray(tags) ? tags : [tags]
}

/** The verb helpers of `router.optimistic(update)`. */
export type OptimisticVisits = Pick<Router, 'visit' | 'get' | 'post' | 'put' | 'patch' | 'delete'>
