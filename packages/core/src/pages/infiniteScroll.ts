import type { BridgePage } from '@swarakaka/bridge-protocol'
import type { PageStore } from './PageStore.js'
import { getDeep, isPlainObject } from './merge.js'
import type { Router } from '../router/Router.js'

/** A page number, a cursor string, or null at an end. */
export type ScrollPage = number | string | null

/** `meta.scroll[prop]` (spec/page.md §12). */
export interface ScrollMeta {
  pageName: string
  dataPath: string
  currentPage: ScrollPage
  previousPage: ScrollPage
  nextPage: ScrollPage
}

export type ScrollDirection = 'next' | 'previous'

export function readScrollMeta(page: BridgePage | null, prop: string): ScrollMeta | null {
  const entry = page?.meta?.scroll?.[prop]
  return entry && typeof entry.pageName === 'string' ? entry : null
}

export interface InfiniteScrollOptions {
  /** The scroll prop (`Bridge::scroll()` on the server). */
  prop: string
  /** More props to reload with every page (counts, filters). */
  only?: string[] | undefined
  /** Keep the address instead of replacing it with the page just loaded. */
  preserveUrl?: boolean | undefined
  /** Pixels around the viewport that count as reached (default 500). */
  buffer?: number | undefined
  /** Never load automatically: the next/previous controls load on demand. */
  manual?: boolean | undefined
  /** Load automatically this many times, then switch to manual. */
  manualAfter?: number | undefined
  /** Newest items at the bottom (chat): the top edge loads the next page. */
  reverse?: boolean | undefined
  /** Resolves once the view layer rendered a store update (Vue: nextTick). Default: two frames. */
  afterRender?: (() => Promise<void>) | undefined
}

export interface InfiniteScrollState {
  hasNext: boolean
  hasPrevious: boolean
  loadingNext: boolean
  loadingPrevious: boolean
  /**
   * Loading at this end waits for `loadNext()`/`loadPrevious()`: manual mode,
   * `manualAfter` reached, not observing yet (server rendering, first render),
   * or no `IntersectionObserver`.
   */
  manualNext: boolean
  manualPrevious: boolean
  /** Text for an `aria-live` region after each load. */
  announcement: string
}

interface Ends {
  previous: ScrollPage
  next: ScrollPage
}

/**
 * Loads a scroll prop page by page (PLAN §13.4). Each load visits the current
 * URL with the page parameter, `only` the prop and `merge` towards its end,
 * then replaces the address with that page. The controller keeps the outer
 * ends of what it loaded (a response only describes its own page) and stores
 * them in history, so back/forward and reloads continue where they left off.
 * A visit that replaces the prop (a search, an invalidation) resets both ends.
 * Construction has no side effects; `start()` observes and subscribes.
 */
export class InfiniteScroll {
  private ends: Ends
  /**
   * The last `meta.scroll` entry seen. Partial responses keep the entries of
   * props they do not carry (`mergePartialMeta`); this is a second line of
   * defence for pages whose `meta` was replaced some other way.
   */
  private meta: ScrollMeta | null
  private busy: ScrollDirection | null = null
  private autoLoads = 0
  private announcement = ''
  private lastValue: unknown
  private observer: IntersectionObserver | null = null
  private observing = false
  private sentinels: { before: Element | null; after: Element | null } = {
    before: null,
    after: null,
  }
  private unsubscribeStore: (() => void) | null = null
  private readonly listeners = new Set<(state: InfiniteScrollState) => void>()
  private snapshot: InfiniteScrollState

  constructor(
    private readonly bridge: { router: Router; store: PageStore },
    private readonly win: Window | null,
    private readonly options: InfiniteScrollOptions,
  ) {
    this.lastValue = this.value()
    this.meta = readScrollMeta(bridge.store.page, options.prop)
    this.ends = this.restoredEnds() ?? this.endsFromMeta()
    this.snapshot = this.computeState()
  }

  /** The current state; the same object until something changes. */
  get state(): InfiniteScrollState {
    return this.snapshot
  }

  subscribe = (listener: (state: InfiniteScrollState) => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Starts observing the two edge elements and following page changes. Call after mount. */
  start(before: Element | null, after: Element | null): void {
    this.stop()
    this.sentinels = { before, after }
    this.unsubscribeStore = this.bridge.store.subscribe(() => this.onStoreChange())
    const Observer = (this.win as (Window & typeof globalThis) | null)?.IntersectionObserver
    if (typeof Observer === 'function' && !this.options.manual) {
      const observer = new Observer((entries) => this.onIntersect(entries), {
        rootMargin: `${this.options.buffer ?? 500}px`,
      })
      if (before) observer.observe(before)
      if (after) observer.observe(after)
      this.observer = observer
      this.observing = true
    }
    this.emit()
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
    this.observing = false
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
  }

  loadNext(): Promise<void> {
    return this.load('next')
  }

  loadPrevious(): Promise<void> {
    return this.load('previous')
  }

  private async load(direction: ScrollDirection): Promise<void> {
    const { router, store } = this.bridge
    const page = store.page
    const meta = this.currentMeta()
    const target = direction === 'next' ? this.ends.next : this.ends.previous
    // One load at a time: a second visit would cancel the first (§11).
    if (this.busy || !page || !meta || target === null) return

    this.busy = direction
    this.emit()

    // Content added above the viewport pushes it down; scroll by the same amount.
    const anchored = direction === (this.options.reverse ? 'next' : 'previous')
    const heightBefore = anchored ? this.scrollHeight() : 0

    const url = new URL(page.url, this.win?.location.href ?? 'http://localhost')
    url.searchParams.set(meta.pageName, String(target))
    const outcome = await router.visit(url, {
      only: [this.options.prop, ...(this.options.only ?? [])],
      merge: direction === 'next' ? 'append' : 'prepend',
      preserveState: true,
      preserveScroll: true,
      replace: true,
      preserveUrl: this.options.preserveUrl ?? false,
      showProgress: false,
    })

    if (outcome.status === 'success') {
      const loaded = readScrollMeta(outcome.page, this.options.prop)
      if (loaded) {
        if (direction === 'next') this.ends.next = loaded.nextPage
        else this.ends.previous = loaded.previousPage
        this.announcement =
          typeof loaded.currentPage === 'number'
            ? `Loaded page ${loaded.currentPage}`
            : 'Loaded more items'
      }
      this.lastValue = this.value()
      this.remember()
    }

    this.busy = null
    this.emit()

    if (outcome.status !== 'success') return
    await (this.options.afterRender ?? (() => this.frames()))()
    if (anchored && this.win) this.win.scrollBy(0, this.scrollHeight() - heightBefore)
    this.recheck()
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const top = entry.target === this.sentinels.before
      const direction: ScrollDirection = top === !this.options.reverse ? 'previous' : 'next'
      if (this.isManual() || this.busy) continue
      if ((direction === 'next' ? this.ends.next : this.ends.previous) === null) continue
      this.autoLoads++
      void this.load(direction)
    }
  }

  /** An edge still in view after a short page produces no new entry: observe it again. */
  private recheck(): void {
    if (!this.observer) return
    for (const element of [this.sentinels.before, this.sentinels.after]) {
      if (!element) continue
      this.observer.unobserve(element)
      this.observer.observe(element)
    }
  }

  private onStoreChange(): void {
    if (this.busy) return
    const value = this.value()
    if (value === this.lastValue) return
    // Replaced by another visit (search, filter, invalidation): start over from its page.
    this.lastValue = value
    this.ends = this.endsFromMeta()
    this.autoLoads = 0
    this.remember()
    this.emit()
  }

  private isManual(): boolean {
    if (this.options.manual || !this.observing) return true
    return this.options.manualAfter !== undefined && this.autoLoads >= this.options.manualAfter
  }

  private computeState(): InfiniteScrollState {
    return {
      hasNext: this.ends.next !== null,
      hasPrevious: this.ends.previous !== null,
      loadingNext: this.busy === 'next',
      loadingPrevious: this.busy === 'previous',
      manualNext: this.isManual(),
      manualPrevious: this.isManual(),
      announcement: this.announcement,
    }
  }

  private emit(): void {
    this.snapshot = this.computeState()
    for (const listener of this.listeners) listener(this.snapshot)
  }

  private value(): unknown {
    return (this.bridge.store.page?.props as Record<string, unknown> | undefined)?.[
      this.options.prop
    ]
  }

  private currentMeta(): ScrollMeta | null {
    this.meta = readScrollMeta(this.bridge.store.page, this.options.prop) ?? this.meta
    return this.meta
  }

  private endsFromMeta(): Ends {
    const meta = this.currentMeta()
    return { previous: meta?.previousPage ?? null, next: meta?.nextPage ?? null }
  }

  private rememberKey(): string {
    return `bridge:scroll:${this.options.prop}`
  }

  /** Ends kept in history, if they belong to the list now shown (same length). */
  private restoredEnds(): Ends | null {
    const saved = this.bridge.router.restore<Ends & { length: number }>(this.rememberKey())
    if (!saved || typeof saved.length !== 'number' || saved.length !== this.length()) return null
    return { previous: saved.previous, next: saved.next }
  }

  private remember(): void {
    if (!this.win) return
    this.bridge.router.remember(this.rememberKey(), { ...this.ends, length: this.length() })
  }

  private length(): number {
    const meta = this.currentMeta()
    const value = this.value()
    const list = meta && isPlainObject(value) ? getDeep(value, meta.dataPath) : value
    return Array.isArray(list) ? list.length : 0
  }

  private scrollHeight(): number {
    return this.win?.document.documentElement.scrollHeight ?? 0
  }

  private frames(): Promise<void> {
    const raf =
      this.win?.requestAnimationFrame?.bind(this.win) ??
      ((fn: FrameRequestCallback) => setTimeout(() => fn(0), 16))
    return new Promise((resolve) => raf(() => raf(() => resolve())))
  }
}
