import type { BridgePage } from '@swarakaka/bridge-protocol'

export interface CacheEntry {
  page: BridgePage
  fetchedAt: number
  /** Set by `prefetch({ cacheTags })`; `flushTags` removes entries by tag. */
  tags: string[]
}

export interface PageCacheOptions {
  /** Entries younger than this are served without revalidation (ms). */
  ttl?: number | undefined
  /** After ttl, entries this much older are still served while revalidating (ms). */
  staleWhileRevalidate?: number | undefined
  max?: number | undefined
  now?: (() => number) | undefined
}

export type CacheLookup = { state: 'fresh' | 'stale'; entry: CacheEntry } | { state: 'miss' }

/** Small LRU used by prefetch and instant back-navigation. */
export class PageCache {
  private entries = new Map<string, CacheEntry>()
  private readonly ttl: number
  private readonly swr: number
  private readonly max: number
  private readonly now: () => number

  constructor(options: PageCacheOptions = {}) {
    this.ttl = options.ttl ?? 30_000
    this.swr = options.staleWhileRevalidate ?? 30_000
    this.max = options.max ?? 50
    this.now = options.now ?? (() => Date.now())
  }

  static key(url: string, only?: string[] | undefined, except?: string[] | undefined): string {
    const o = only && only.length ? `|only=${[...only].sort().join(',')}` : ''
    const e = except && except.length ? `|except=${[...except].sort().join(',')}` : ''
    return `${url}${o}${e}`
  }

  get(key: string): CacheLookup {
    const entry = this.entries.get(key)
    if (!entry) return { state: 'miss' }
    const age = this.now() - entry.fetchedAt
    if (age <= this.ttl) {
      this.touch(key, entry)
      return { state: 'fresh', entry }
    }
    if (age <= this.ttl + this.swr) {
      this.touch(key, entry)
      return { state: 'stale', entry }
    }
    this.entries.delete(key)
    return { state: 'miss' }
  }

  /** Stores a page; without `tags`, an entry replacing one keeps that entry's tags. */
  set(key: string, page: BridgePage, tags?: string[]): void {
    const kept = tags ?? this.entries.get(key)?.tags ?? []
    this.entries.delete(key)
    this.entries.set(key, { page, fetchedAt: this.now(), tags: kept })
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  /** Removes every entry carrying any of these tags; returns how many were removed. */
  flushTags(tags: string[]): number {
    let removed = 0
    for (const [key, entry] of this.entries) {
      if (entry.tags.some((tag) => tags.includes(tag))) {
        this.entries.delete(key)
        removed++
      }
    }
    return removed
  }

  get size(): number {
    return this.entries.size
  }

  private touch(key: string, entry: CacheEntry): void {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }
}
