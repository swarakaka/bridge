import type { BridgePage } from '@swarakaka/bridge-protocol'
import { isPlainObject } from './merge.js'

/**
 * Watched props (PLAN §20.6, spec/page.md §13, spec/stream.md §3.1): a page
 * lists the watch tags of each watched prop in `meta.watch`, and a stream
 * `invalidate` with `tags` reloads the props whose tags match.
 */

/** `meta.watch` of a page: prop → tags. */
export function readWatch(page: BridgePage | null): Record<string, string[]> {
  const watch = (page?.meta as Record<string, unknown> | undefined)?.watch
  if (!isPlainObject(watch)) return {}
  const out: Record<string, string[]> = {}
  for (const [prop, tags] of Object.entries(watch)) {
    if (Array.isArray(tags)) out[prop] = tags.filter((t): t is string => typeof t === 'string')
  }
  return out
}

/**
 * Whether a published tag covers a watched one: equal, or `<tag>.*` against
 * `<tag>` and `<tag>.<key>`.
 */
export function tagMatches(published: string, watched: string): boolean {
  if (published === watched) return true
  if (!published.endsWith('.*')) return false
  const base = published.slice(0, -2)
  return watched === base || watched.startsWith(`${base}.`)
}

/** Props of `page` watching any of the published `tags`, in `meta.watch` order. */
export function watchingProps(page: BridgePage | null, tags: readonly string[]): string[] {
  return Object.entries(readWatch(page))
    .filter(([, watched]) => watched.some((w) => tags.some((t) => tagMatches(t, w))))
    .map(([prop]) => prop)
}
