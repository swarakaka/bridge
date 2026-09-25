import type { BridgePage, BridgeStreamControl } from '@swarakaka/bridge-protocol'
import { getDeep, hasDeep, isPlainObject, mergeValue, setDeep, type MergeMode } from './merge.js'

/** `meta` members that describe individual props: lists of keys, and maps keyed by prop. */
const PROP_LISTS = ['merge', 'prepend', 'deepMerge'] as const
const PROP_MAPS = ['matchOn', 'once', 'scroll', 'watch'] as const

/**
 * The `meta` of a page after merging a partial response (spec/page.md §3). A
 * partial response only describes the props it carries, so members about
 * props are updated per prop: entries for props in the response come from it,
 * entries for other props are kept. Page-level members (`encryptHistory`,
 * application meta) come from the response, like a full page's.
 */
export function mergePartialMeta(
  previous: BridgePage['meta'],
  response: BridgePage,
): BridgePage['meta'] {
  const incoming = (response.meta ?? {}) as Record<string, unknown>
  const before = (previous ?? {}) as Record<string, unknown>
  const onceIn = isPlainObject(incoming.once) ? incoming.once : {}
  const covered = new Set([...Object.keys(response.props as object), ...Object.keys(onceIn)])
  const scoped = new Set<string>([...PROP_LISTS, ...PROP_MAPS])

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(incoming)) if (!scoped.has(key)) out[key] = value

  for (const member of PROP_LISTS) {
    const kept = Array.isArray(before[member])
      ? (before[member] as unknown[]).filter((k) => typeof k === 'string' && !covered.has(k))
      : []
    const added = Array.isArray(incoming[member]) ? (incoming[member] as unknown[]) : []
    const list = [...kept, ...added.filter((k) => !kept.includes(k))]
    if (list.length > 0) out[member] = list
  }

  for (const member of PROP_MAPS) {
    const kept = isPlainObject(before[member])
      ? Object.fromEntries(Object.entries(before[member]).filter(([k]) => !covered.has(k)))
      : {}
    const map = { ...kept, ...(isPlainObject(incoming[member]) ? incoming[member] : {}) }
    if (Object.keys(map).length > 0) out[member] = map
  }

  return Object.keys(out).length > 0 ? (out as BridgePage['meta']) : undefined
}

/** A visit's merge opt-in: each key's own mode, or one direction for all merge keys. */
export type MergeOption = boolean | 'append' | 'prepend'

/** How a merge key combines with the current value (spec/page.md §3). */
export type MergeHintMode = 'append' | 'prepend' | 'deep'

export interface MergeHint {
  mode: MergeHintMode
  /** Match paths: the last segment is the item key, the others lead to the array. */
  matchOn: string[]
}

/** Merge keys of a page by mode, from `meta.merge`, `meta.prepend`, `meta.deepMerge` and `meta.matchOn`. */
export function readMergeModes(page: BridgePage): Record<string, MergeHint> {
  const meta = (page.meta ?? {}) as Record<string, unknown>
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string') : []
  const matchOn = isPlainObject(meta.matchOn) ? meta.matchOn : {}
  const hints: Record<string, MergeHint> = {}
  const add = (keys: unknown, mode: MergeHintMode): void => {
    for (const key of strings(keys)) hints[key] ??= { mode, matchOn: strings(matchOn[key]) }
  }
  add(meta.merge, 'append')
  add(meta.prepend, 'prepend')
  add(meta.deepMerge, 'deep')
  return hints
}

/** Every key the server marked for merging, whatever its mode. */
export function readMergeKeys(page: BridgePage): string[] {
  return Object.keys(readMergeModes(page))
}

/**
 * Combines an incoming prop value with the current one (spec/page.md §3).
 * append/prepend: arrays concatenate at that end; objects concatenate their
 * array members and take the rest from the incoming value. deep: objects merge
 * at every depth and arrays append. A match path replaces an item already
 * shown instead of adding it again.
 */
export function combineProp(
  current: unknown,
  incoming: unknown,
  mode: MergeHintMode = 'append',
  matchOn: string[] = [],
): unknown {
  const itemKeys = new Map<string, string>()
  for (const path of matchOn) {
    const cut = path.lastIndexOf('.')
    itemKeys.set(cut === -1 ? '' : path.slice(0, cut), path.slice(cut + 1))
  }
  return combine(current, incoming, mode, itemKeys, '')
}

function combine(
  current: unknown,
  incoming: unknown,
  mode: MergeHintMode,
  itemKeys: Map<string, string>,
  path: string,
): unknown {
  if (Array.isArray(current) && Array.isArray(incoming))
    return concatItems(current, incoming, mode === 'prepend', itemKeys.get(path))
  if (!isPlainObject(current) || !isPlainObject(incoming)) return incoming

  const out: Record<string, unknown> = { ...current, ...incoming }
  for (const key of Object.keys(incoming)) {
    const child = path === '' ? key : `${path}.${key}`
    if (mode === 'deep') out[key] = combine(current[key], incoming[key], mode, itemKeys, child)
    else if (Array.isArray(current[key]) && Array.isArray(incoming[key]))
      out[key] = concatItems(
        current[key] as unknown[],
        incoming[key] as unknown[],
        mode === 'prepend',
        itemKeys.get(child),
      )
  }
  return out
}

function concatItems(
  current: unknown[],
  incoming: unknown[],
  prepend: boolean,
  itemKey: string | undefined,
): unknown[] {
  if (itemKey === undefined) return prepend ? [...incoming, ...current] : [...current, ...incoming]

  const idOf = (item: unknown): unknown =>
    isPlainObject(item) && itemKey in item ? item[itemKey] : undefined
  const positions = new Map<unknown, number>()
  current.forEach((item, index) => {
    const id = idOf(item)
    if (id !== undefined && !positions.has(id)) positions.set(id, index)
  })

  const kept = [...current]
  const added: unknown[] = []
  for (const item of incoming) {
    const id = idOf(item)
    const at = id === undefined ? undefined : positions.get(id)
    if (at === undefined) added.push(item)
    else kept[at] = item
  }
  return prepend ? [...added, ...kept] : [...kept, ...added]
}

/**
 * Appends incoming data to the current value: arrays concatenate; paginator-like
 * objects concatenate `data` and take the rest (links, meta) from the incoming page.
 */
export function appendProp(current: unknown, incoming: unknown): unknown {
  return combineProp(current, incoming, 'append')
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
  /**
   * Combine keys the server marked for merging instead of replacing them
   * (opt-in per visit): `true` uses each key's mode, `'append'`/`'prepend'`
   * override it for every merge key.
   */
  merge?: MergeOption | undefined
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
      const hints = options.merge ? readMergeModes(page) : {}
      const override = typeof options.merge === 'string' ? options.merge : null
      const merged: Record<string, unknown> = { ...(server.props as Record<string, unknown>) }
      for (const [key, value] of Object.entries(page.props as Record<string, unknown>)) {
        const hint = hints[key]
        merged[key] = hint
          ? combineProp(
              (server.props as Record<string, unknown>)[key],
              value,
              override ?? hint.mode,
              hint.matchOn,
            )
          : value
      }
      const props = this.holdOptimistic(merged)
      const { meta: _previousMeta, ...rest } = previous
      const meta = mergePartialMeta(previous.meta, page)
      this.state = {
        ...this.state,
        page: {
          ...rest,
          url: page.url,
          build: page.build,
          props,
          ...(meta ? { meta } : {}),
        },
        // A background merge (deferred or lazy props, an invalidation) must not
        // dismiss an error shown in place of the page; a full page swap does.
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
