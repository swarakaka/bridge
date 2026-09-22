import type { BridgeError, BridgePage } from '@swarakaka/bridge-protocol'
import { PageCache } from '../cache/PageCache.js'
import type { Emitter } from '../events/Emitter.js'
import type { RequestManager } from '../http/RequestManager.js'
import { parseResponse, type ParsedResponse } from '../http/responseParser.js'
import type { PageStore } from '../pages/PageStore.js'
import type { History, HistoryState } from './History.js'
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
  events: Emitter<RouterEvents>
  build: () => string | null
  window: Window | null
  reloadDebounce: number
  hardReloadOnError: boolean
  allowExternalNavigate: boolean
  /** Called with a page before it is applied, e.g. to load its component. */
  prepare?: ((page: BridgePage) => Promise<void> | void) | undefined
}

export interface ReloadOptions {
  only?: string[] | undefined
  except?: string[] | undefined
  headers?: Record<string, string> | undefined
  preserveScroll?: boolean | undefined
  onSuccess?: ((page: BridgePage) => void) | undefined
  onFinish?: (() => void) | undefined
}

interface PendingReload {
  only: Set<string> | null
  except: Set<string>
  headers: Record<string, string>
  preserveScroll: boolean
  resolvers: Array<(outcome: VisitOutcome) => void>
  callbacks: ReloadOptions[]
}

/**
 * Navigation engine: visits, partial reloads, deferred props, prefetch,
 * history and scroll (PLAN §11).
 */
export class Router {
  private activeVisit: Visit | null = null
  private deferredControllers = new Set<AbortController>()
  private visitId = 0
  private pendingReload: PendingReload | null = null
  private reloadTimer: ReturnType<typeof setTimeout> | null = null
  private unlistenHistory: (() => void) | null = null
  private readonly d: RouterDependencies

  constructor(deps: RouterDependencies) {
    this.d = deps
  }

  /** Registers history listeners and records the initial entry. Call once after the page is available. */
  init(): void {
    const page = this.d.store.page
    if (page && this.d.window) {
      const existing = this.d.history.current()
      if (!existing) this.d.history.push(page, this.d.store.current.key, true)
    }
    this.unlistenHistory = this.d.history.listen((state) => this.onPopState(state))
    if (page) void this.loadDeferred(page)
  }

  destroy(): void {
    this.unlistenHistory?.()
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
        only: new Set(),
        except: new Set(),
        headers: {},
        preserveScroll: true,
        resolvers: [],
        callbacks: [],
      })

      if (!options.only || options.only.length === 0) pending.only = null
      else if (pending.only) options.only.forEach((k) => pending.only!.add(k))
      options.except?.forEach((k) => pending.except.add(k))
      Object.assign(pending.headers, options.headers ?? {})
      if (options.preserveScroll === false) pending.preserveScroll = false
      pending.resolvers.push(resolve)
      pending.callbacks.push(options)

      if (this.reloadTimer) clearTimeout(this.reloadTimer)
      this.reloadTimer = setTimeout(() => void this.flushReload(), this.d.reloadDebounce)
    })
  }

  /** Reload the given prop keys ("*" reloads everything present on the page). */
  invalidate(keys: string[] | '*'): Promise<VisitOutcome> | null {
    const page = this.d.store.page
    if (!page) return null
    if (keys === '*') return this.reload()
    const present = keys.filter((key) => this.d.store.hasProp(key.split('.')[0]!))
    if (present.length === 0) return null
    return this.reload({ only: present })
  }

  /** Server-initiated navigation (stream `navigate` control event). */
  navigate(url: string, replace = false): Promise<VisitOutcome> | null {
    if (!isSameOrigin(url) && !this.d.allowExternalNavigate) return null
    return this.visit(url, { replace })
  }

  async prefetch(
    url: string | URL,
    options: Pick<VisitOptions, 'only' | 'except' | 'headers'> = {},
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
        prefetch: true,
      })
      const parsed = await parseResponse(response)
      if (parsed.kind === 'page') this.d.cache.set(key, parsed.page)
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

  clearCache(): void {
    this.d.cache.clear()
  }

  cancel(): void {
    this.cancelActive()
  }

  // ---------------------------------------------------------------------------

  private async flushReload(): Promise<void> {
    const pending = this.pendingReload
    this.pendingReload = null
    this.reloadTimer = null
    if (!pending) return

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
        await this.prepare(lookup.entry.page)
        this.applyPage(lookup.entry.page, visit)
        this.finish(visit, options)
        options.onSuccess?.(lookup.entry.page)
        return { status: 'success', page: lookup.entry.page }
      }
      if (lookup.state === 'stale') {
        await this.prepare(lookup.entry.page)
        this.applyPage(lookup.entry.page, visit)
        visit.preserveState = true
        visit.preserveScroll = true
        visit.replace = true
      }
    }

    this.d.events.emit('start', visit)
    options.onStart?.(visit)

    let parsed: ParsedResponse
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
        signal: visit.controller.signal,
        forceFormData: options.forceFormData,
        onProgress: (progress) => {
          this.d.events.emit('progress', { visit, progress })
          options.onProgress?.(progress)
        },
      })
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

    const outcome = await this.handleParsed(parsed, visit, options, cacheable ? cacheKey : null)
    this.finish(visit, options)
    return outcome
  }

  private async handleParsed(
    parsed: ParsedResponse,
    visit: Visit,
    options: VisitOptions,
    cacheKey: string | null,
  ): Promise<VisitOutcome> {
    switch (parsed.kind) {
      case 'conflict':
        this.hardNavigate(parsed.location)
        return { status: 'redirected' }

      case 'unsupported':
        this.hardNavigate(visit.url.href)
        return { status: 'redirected' }

      case 'page': {
        if (cacheKey && visit.method === 'get') this.d.cache.set(cacheKey, parsed.page)
        if (visit.method !== 'get') this.d.cache.clear()
        await this.prepare(parsed.page)
        if (visit.cancelled) return { status: 'cancelled' }
        this.applyPage(parsed.page, visit)
        this.d.events.emit('success', { visit, page: parsed.page })
        options.onSuccess?.(parsed.page)
        return { status: 'success', page: parsed.page }
      }

      case 'error':
        return this.handleError(parsed.error, visit, options)

      case 'empty':
        // 204/304: nothing to apply (Precognition success, not modified).
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

    if (error.status === 401 || error.status === 403 || error.status === 419) this.d.cache.clear()

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

  private applyPage(page: BridgePage, visit: Visit): void {
    const current = this.d.store.page
    const partial =
      (visit.only.length > 0 || visit.except.length > 0) &&
      current !== null &&
      current.component === page.component

    if (partial) {
      this.d.store.setPage(page, { partial: true, merge: visit.merge })
      this.d.history.updatePage(this.d.store.page!)
      this.d.events.emit('navigate', { page: this.d.store.page!, visit })
      return
    }

    if (current && this.d.window) this.d.history.saveScroll(captureScroll(this.d.window.document))

    this.d.store.setPage(page, { preserveState: visit.preserveState })

    const replace =
      visit.replace ||
      (this.d.window !== null && relativeUrl(page.url) === relativeUrl(this.d.window.location.href))
    this.d.history.push(page, this.d.store.current.key, replace)

    if (!visit.preserveScroll && this.d.window) resetScroll(this.d.window.document, visit.url.hash)

    this.d.events.emit('navigate', { page, visit })
    void this.loadDeferred(page)
  }

  private async loadDeferred(page: BridgePage): Promise<void> {
    const groups = page.deferred
      ? Object.values(page.deferred).filter((g): g is [string, ...string[]] => Array.isArray(g))
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
            signal: controller.signal,
          })
          const parsed = await parseResponse(response)
          const current = this.d.store.page
          if (parsed.kind === 'page' && current && current.component === parsed.page.component) {
            this.d.store.setPage(parsed.page, { partial: true })
            this.d.history.updatePage(this.d.store.page!)
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

  private onPopState(state: HistoryState | null): void {
    this.cancelActive()
    this.cancelDeferred()

    if (state?.page) {
      void this.restoreFromHistory(state)
      return
    }

    if (this.d.window)
      void this.visit(this.d.window.location.href, { replace: true, useCache: false })
  }

  private async restoreFromHistory(state: HistoryState): Promise<void> {
    await this.prepare(state.page)
    {
      this.d.store.setPage(state.page, { preserveState: false })
      if (this.d.window) restoreScroll(state.scroll, this.d.window.document)
      this.d.events.emit('navigate', { page: state.page, visit: null })
    }
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
