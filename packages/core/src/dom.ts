import { EMBEDDED_PAGE_ID, isPage } from '@swarakaka/bridge-protocol'
import type { BridgePage } from '@swarakaka/bridge-protocol'

/** Reads the page object embedded by the HTML shell (spec/page.md §2). */
export function readEmbeddedPage(doc: Document = document): BridgePage | null {
  const el = doc.getElementById(EMBEDDED_PAGE_ID)
  if (!el || !el.textContent) return null
  try {
    const parsed: unknown = JSON.parse(el.textContent)
    return isPage(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function readMeta(name: string, doc: Document = document): string | null {
  return doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null
}

export function readBuild(doc: Document = document): string | null {
  return readMeta('bridge-build', doc)
}
