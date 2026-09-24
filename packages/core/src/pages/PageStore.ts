import type { BridgePage, BridgeStreamControl } from '@swarakaka/bridge-protocol'
import { getDeep, hasDeep, isPlainObject, mergeValue, setDeep, type MergeMode } from './merge.js'

/** Keys the server marked with Bridge::merge() (spec/page.md §3, `meta.merge`). */
export function readMergeKeys(page: BridgePage): string[] {
  const meta = (page as { meta?: { merge?: unknown } }).meta
  return Array.isArray(meta?.merge)
    ? meta.merge.filter((k): k is string => typeof k === 'string')
    : []
}

/**
 * Appends incoming data to the current value: arrays concatenate; paginator-like
 * objects concatenate `data` and take the rest (links, meta) from the incoming page.
 */
export function appendProp(current: unknown, incoming: unknown): unknown {
  if (Array.isArray(current) && Array.isArray(incoming)) return [...current, ...incoming]
  if (isPlainObject(current) && isPlainObject(incoming)) {
    const out: Record<string, unknown> = { ...current, ...incoming }
    for (const key of Object.keys(incoming)) {
      if (Array.isArray(current[key]) && Array.isArray(incoming[key])) {
        out[key] = [...(current[key] as unknown[]), ...(incoming[key] as unknown[])]
      }
    }
    return out
  }
  return incoming
}

export interface PageState {
  page: BridgePage | null
  /** Changes whenever the page component should be re-created (non-preserveState navigation). */
  key: number
  /** Deferred prop keys currently being loaded. */
  loading: Set<string>
  /** Non-validation error to display in place of the page (status, message). */
  error: { status: number; kind: string; message: string } | null
}

export type PageListener = (state: PageState) => void

export interface SetPageOptions {
  preserveState?: boolean | undefined
  /** Merge only the returned keys into the current props (partial reload). */
  partial?: boolean | undefined
  /** Append keys listed in `meta.merge` instead of replacing them (opt-in per visit). */
  merge?: boolean | undefined
}

/**
 * How a settled optimistic update leaves a prop it was the last to hold:
 * `server` shows the latest server value (failures, and successes that
 * brought a page), `keep` leaves the optimistic value (a success without a
 * page, such as a JSON mutation or a 204).
 */
export type OptimisticSettle = 'server' | 'keep'

/** What forms need to show optimistic updates on the page (PLAN §14.3). */
export interface OptimisticTarget {
  readonly page: BridgePage | null
  applyOptimistic(patch: Record<string, unknown>): number | null
  settleOptimistic(token: number, mode: OptimisticSettle): void
}

/**
 * Holds the current page and notifies subscribers. Framework adapters wrap
 * this in their reactivity system.
 *
 * Optimistic updates (PLAN §14.3) own the top-level props they change until
 * their request settles. Server data for an owned prop (a page, a partial
 * reload, a stream `prop` event, `patchProps`) replaces its snapshot, not the
 * displayed value; `serverPage` is the page with snapshots, which is what
 * history stores. Owners belong to one page instance (`key`).
 */
export class PageStore implements OptimisticTarget {
  private state: PageState = { page: null, key: 0, loading: new Set(), error: null }
  private listeners = new Set<PageListener>()
  private optimistic = {
    pageKey: 0,
    next: 1,
    owners: new Map<string, Set<number>>(),
    snapshots: new Map<string, unknown>(),
  }

  constructor(initial: BridgePage | null = null) {
    if (initial) this.state.page = initial
  }

  get page(): BridgePage | null {
    return this.state.page
  }

  get current(): PageState {
    return this.state
  }

  /** The page with pending optimistic props replaced by the server values they hide. */
  get serverPage(): BridgePage | null {
    const page = this.state.page
    if (!page || this.optimistic.owners.size === 0) return page
    const props: Record<string, unknown> = { ...(page.props as Record<string, unknown>) }
    for (const [key, value] of this.optimistic.snapshots) props[key] = value
    return { ...page, props }
  }

  /** Shows `patch` over the current props until `settleOptimistic(token)`; null without a page. */
  applyOptimistic(patch: Record<string, unknown>): number | null {
    const page = this.state.page
    if (!page) return null
    this.scopeOptimistic()
    const token = this.optimistic.next++
    const props: Record<string, unknown> = { ...(page.props as Record<string, unknown>) }
    for (const [key, value] of Object.entries(patch)) {
      const owners = this.optimistic.owners.get(key) ?? new Set<number>()
      if (owners.size === 0) this.optimistic.snapshots.set(key, props[key])
      owners.add(token)
      this.optimistic.owners.set(key, owners)
      props[key] = value
    }
    this.state = { ...this.state, page: { ...page, props } }
    this.notify()
    return token
  }

  /**
   * Gives up the token's props. A prop still held by another pending update
   * keeps showing that update; the last holder releases it (see `OptimisticSettle`).
   */
  settleOptimistic(token: number, mode: OptimisticSettle): void {
    const page = this.state.page
    if (!page || this.optimistic.pageKey !== this.state.key) return
    const props: Record<string, unknown> = { ...(page.props as Record<string, unknown>) }
    let changed = false
    for (const [key, owners] of Array.from(this.optimistic.owners)) {
      if (!owners.delete(token) || owners.size > 0) continue
      this.optimistic.owners.delete(key)
      if (mode === 'server') {
        props[key] = this.optimistic.snapshots.get(key)
        changed = true
      }
      this.optimistic.snapshots.delete(key)
    }
    if (!changed) return
    this.state = { ...this.state, page: { ...page, props } }
    this.notify()
  }

  /** Server values for some props (e.g. after a JSON mutation), without a request. */
  patchProps(patch: Record<string, unknown>): void {
    const page = this.serverPage
    if (!page) return
    this.commitServerProps({ ...(page.props as Record<string, unknown>), ...patch })
  }

  subscribe(listener: PageListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setPage(page: BridgePage, options: SetPageOptions = {}): void {
    const previous = this.state.page

    if (options.partial && previous && previous.component === page.component) {
      const server = this.serverPage!
      const mergeKeys = new Set(options.merge ? readMergeKeys(page) : [])
      const merged: Record<string, unknown> = { ...(server.props as Record<string, unknown>) }
      for (const [key, value] of Object.entries(page.props as Record<string, unknown>)) {
        merged[key] = mergeKeys.has(key)
          ? appendProp((server.props as Record<string, unknown>)[key], value)
          : value
      }
      const props = this.holdOptimistic(merged)
      this.state = {
        ...this.state,
        page: {
          ...previous,
          url: page.url,
          build: page.build,
          props,
          ...(page.meta ? { meta: page.meta } : {}),
        },
        error: null,
      }
      this.notify()
      return
    }

    const sameComponent = previous?.component === page.component
    const preserve = options.preserveState === true && sameComponent
    if (preserve) {
      page = { ...page, props: this.holdOptimistic(page.props as Record<string, unknown>) }
    } else {
      this.clearOptimistic(this.state.key + 1)
    }

    this.state = {
      ...this.state,
      page,
      key: preserve ? this.state.key : this.state.key + 1,
      loading: new Set(),
      error: null,
    }
    this.notify()
  }

  /** Replace props wholesale (used by history restore). */
  replaceProps(props: Record<string, unknown>): void {
    if (!this.state.page) return
    this.commitServerProps(props)
  }

  setProp(key: string, value: unknown, mode: MergeMode = 'replace'): void {
    const server = this.serverPage
    if (!server) return
    const current = getDeep(server.props, key)
    this.commitServerProps(setDeep(server.props, key, mergeValue(current, value, mode)))
  }

  hasProp(key: string): boolean {
    return this.state.page ? hasDeep(this.state.page.props, key) : false
  }

  setLoading(keys: string[], loading: boolean): void {
    const next = new Set(this.state.loading)
    for (const key of keys) {
      if (loading) next.add(key)
      else next.delete(key)
    }
    this.state = { ...this.state, loading: next }
    this.notify()
  }

  setError(error: PageState['error']): void {
    this.state = { ...this.state, error }
    this.notify()
  }

  /**
   * Applies a `prop` control event. `invalidate` and `navigate` need the
   * router and are handled there (Phase 3 wires the stream client).
   */
  applyControl(event: BridgeStreamControl): boolean {
    if (event.type === 'prop') {
      if (!this.hasProp(event.key)) return false
      this.setProp(event.key, event.value, event.mode ?? 'replace')
      return true
    }
    return false
  }

  private commitServerProps(props: Record<string, unknown>): void {
    if (!this.state.page) return
    this.state = { ...this.state, page: { ...this.state.page, props: this.holdOptimistic(props) } }
    this.notify()
  }

  /** Server props with owned keys routed to their snapshots and the optimistic values kept. */
  private holdOptimistic(server: Record<string, unknown>): Record<string, unknown> {
    if (this.optimistic.owners.size === 0) return server
    const shown = (this.state.page?.props ?? {}) as Record<string, unknown>
    const props = { ...server }
    for (const key of this.optimistic.owners.keys()) {
      this.optimistic.snapshots.set(key, server[key])
      props[key] = shown[key]
    }
    return props
  }

  /** Pending updates belong to one page instance; a new one starts clean. */
  private scopeOptimistic(): void {
    if (this.optimistic.pageKey !== this.state.key) this.clearOptimistic(this.state.key)
  }

  /** Drops pending updates; `pageKey` is the page instance new ones will belong to. */
  private clearOptimistic(pageKey: number): void {
    this.optimistic.owners.clear()
    this.optimistic.snapshots.clear()
    this.optimistic.pageKey = pageKey
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) listener(this.state)
  }
}
