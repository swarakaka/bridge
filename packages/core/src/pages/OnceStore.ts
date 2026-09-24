import type { BridgePage } from '@swarakaka/bridge-protocol'

export interface OnceEntry {
  key: string
  expiresAt: number | null
}

/** `meta.once` of a page (spec/page.md §11): prop name → once key and expiry. */
export function readOnceMeta(page: BridgePage): Record<string, OnceEntry> {
  const once = page.meta?.once
  if (!once || typeof once !== 'object') return {}
  const entries: Record<string, OnceEntry> = {}
  for (const [prop, entry] of Object.entries(once)) {
    if (entry && typeof entry.key === 'string')
      entries[prop] = { key: entry.key, expiresAt: entry.expiresAt ?? null }
  }
  return entries
}

/**
 * Values of once props for this tab (PLAN §13.2), in memory only. Keys the
 * store holds are sent in `X-Bridge-Once`; the server then leaves those
 * values out and the router fills them back in before a page is applied.
 */
export class OnceStore {
  private values = new Map<string, { value: unknown; expiresAt: number | null }>()
  private readonly now: () => number

  constructor(options: { now?: (() => number) | undefined } = {}) {
    this.now = options.now ?? (() => Date.now())
  }

  /** Keys to announce: held and not expired. Expired values are dropped. */
  heldKeys(): string[] {
    const now = this.now()
    const keys: string[] = []
    for (const [key, entry] of this.values) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.values.delete(key)
      else keys.push(key)
    }
    return keys
  }

  has(key: string): boolean {
    return this.values.has(key)
  }

  set(key: string, value: unknown, expiresAt: number | null): void {
    this.values.set(key, { value, expiresAt })
  }

  clear(): void {
    this.values.clear()
  }

  get size(): number {
    return this.values.size
  }

  /**
   * Records the once values a server page carries and fills in the ones it
   * left out. A value the server omitted is used even if it expired since the
   * request announced it. Returns the completed page and the props that could
   * not be filled (the store lost them), which the caller requests again.
   */
  complete(page: BridgePage): { page: BridgePage; missing: string[] } {
    const once = readOnceMeta(page)
    const names = Object.keys(once)
    if (names.length === 0) return { page, missing: [] }

    const props = page.props as Record<string, unknown>
    let filled: Record<string, unknown> | null = null
    const missing: string[] = []

    for (const name of names) {
      const { key, expiresAt } = once[name]!
      if (name in props) {
        this.set(key, props[name], expiresAt)
        continue
      }
      const stored = this.values.get(key)
      if (stored) (filled ??= { ...props })[name] = stored.value
      else missing.push(name)
    }

    return { page: filled ? { ...page, props: filled } : page, missing }
  }
}
