import { inject, type InjectionKey } from 'vue'

/** Collected by the SSR renderer; BridgeHead writes into it on the server. */
export interface HeadContext {
  title: string | null
  meta: Array<Record<string, string>>
}

export const HeadKey: InjectionKey<HeadContext> = Symbol('bridge-head')

export function useHeadContext(): HeadContext | null {
  return inject(HeadKey, null)
}

export function createHeadContext(): HeadContext {
  return { title: null, meta: [] }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Head fragments for the shell (spec: strings inserted verbatim after @bridgeHead). */
export function renderHead(head: HeadContext): string[] {
  const out: string[] = []
  if (head.title !== null) out.push(`<title>${escapeAttribute(head.title)}</title>`)
  for (const meta of head.meta) {
    const attrs = Object.entries(meta)
      .map(([k, v]) => `${k}="${escapeAttribute(v)}"`)
      .join(' ')
    out.push(`<meta ${attrs}>`)
  }
  return out
}
