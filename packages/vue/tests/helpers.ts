import type { BridgePage } from '@swarakaka/bridge-core'
import { vi } from 'vitest'

export function page(overrides: Partial<BridgePage> = {}): BridgePage {
  return {
    protocol: 1,
    type: 'page',
    component: 'Customers/Index',
    url: '/customers',
    props: { title: 'Customers', customers: [{ id: 1, name: 'Acme' }] },
    build: 'b1',
    ...overrides,
  }
}

export function pageResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.bridge+json; v=1' },
  })
}

export function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = await handler(url, init ?? {})
    Object.defineProperty(response, 'url', { value: url })
    return response
  }) as unknown as typeof fetch
}

export function embed(p: BridgePage): void {
  document.body.innerHTML = `<script type="application/json" id="bridge-page">${JSON.stringify(p)}</script><div id="app"></div>`
}

export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 10))
