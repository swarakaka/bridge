import type { BridgePage, BridgeStreamControl } from '@swarakaka/bridge-protocol'
import { getDeep, hasDeep, mergeValue, setDeep, type MergeMode } from './merge'

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
}

/**
 * Holds the current page and notifies subscribers. Framework adapters wrap
 * this in their reactivity system.
 */
export class PageStore {
  private state: PageState = { page: null, key: 0, loading: new Set(), error: null }
  private listeners = new Set<PageListener>()

  constructor(initial: BridgePage | null = null) {
    if (initial) this.state.page = initial
  }

  get page(): BridgePage | null {
    return this.state.page
  }

  get current(): PageState {
    return this.state
  }

  subscribe(listener: PageListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setPage(page: BridgePage, options: SetPageOptions = {}): void {
    const previous = this.state.page

    if (options.partial && previous && previous.component === page.component) {
      this.state = {
        ...this.state,
        page: {
          ...previous,
          url: page.url,
          build: page.build,
          props: { ...previous.props, ...page.props },
        },
        error: null,
      }
      this.notify()
      return
    }

    const sameComponent = previous?.component === page.component
    const preserve = options.preserveState === true && sameComponent

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
    this.state = { ...this.state, page: { ...this.state.page, props } }
    this.notify()
  }

  setProp(key: string, value: unknown, mode: MergeMode = 'replace'): void {
    if (!this.state.page) return
    const current = getDeep(this.state.page.props, key)
    const props = setDeep(this.state.page.props, key, mergeValue(current, value, mode))
    this.state = { ...this.state, page: { ...this.state.page, props } }
    this.notify()
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

  private notify(): void {
    for (const listener of Array.from(this.listeners)) listener(this.state)
  }
}
