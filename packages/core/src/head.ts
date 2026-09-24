/** Title and meta tags a page declares (BridgeHead in the adapters). */
export interface HeadData {
  title: string | null
  meta: Array<Record<string, string>>
}

/** Marks <meta> tags managed by BridgeHead ("ssr" when server-rendered, "client" otherwise). */
export const HEAD_ATTRIBUTE = 'data-bridge-head'

export function createHeadData(): HeadData {
  return { title: null, meta: [] }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Head fragments for the shell, inserted verbatim after @bridgeHead by the Laravel SSR gateway. */
export function renderHead(head: HeadData): string[] {
  const out: string[] = []
  if (head.title !== null) out.push(`<title>${escapeAttribute(head.title)}</title>`)
  for (const meta of head.meta) {
    const attrs = Object.entries(meta)
      .map(([k, v]) => `${k}="${escapeAttribute(v)}"`)
      .join(' ')
    out.push(`<meta ${attrs} ${HEAD_ATTRIBUTE}="ssr">`)
  }
  return out
}

/**
 * Client-side owner of one component's <meta> tags. Server-rendered tags are
 * removed on the first apply; whichever component declared them recreates its own.
 */
export class HeadManager {
  private owned: HTMLElement[] = []
  private readonly originalTitle: string
  private titled = false

  constructor(private readonly doc: Document) {
    this.originalTitle = doc.title
    doc.head.querySelectorAll(`meta[${HEAD_ATTRIBUTE}="ssr"]`).forEach((el) => el.remove())
  }

  apply(head: { title?: string | null | undefined; meta?: Array<Record<string, string>> }): void {
    if (head.title) {
      this.doc.title = head.title
      this.titled = true
    }
    this.owned.forEach((el) => el.remove())
    this.owned = (head.meta ?? []).map((attributes) => {
      const el = this.doc.createElement('meta')
      for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value)
      el.setAttribute(HEAD_ATTRIBUTE, 'client')
      this.doc.head.appendChild(el)
      return el
    })
  }

  /** Removes the owned tags and restores the title if this manager changed it. */
  dispose(): void {
    this.owned.forEach((el) => el.remove())
    this.owned = []
    if (this.titled) this.doc.title = this.originalTitle
  }
}
