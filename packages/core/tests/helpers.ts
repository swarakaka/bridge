import type { BridgePage } from '@swarakaka/bridge-protocol'
import { vi } from 'vitest'
import { createBridge, type Bridge } from '../src/createBridge.js'
import type { BridgeConfig } from '../src/config.js'

export function page(overrides: Partial<BridgePage> = {}): BridgePage {
  return {
    protocol: 1,
    type: 'page',
    component: 'Customers/Index',
    url: '/customers',
    props: { customers: [{ id: 1 }], filters: { search: null } },
    build: 'b1',
    ...overrides,
  }
}

export function pageResponse(
  body: unknown,
  init: { status?: number; url?: string; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/vnd.bridge+json; v=1', ...(init.headers ?? {}) },
  })
}

export function withUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url })
  return response
}

export interface FetchMock extends ReturnType<typeof vi.fn> {
  calls(): Array<{ url: string; init: RequestInit }>
}

export function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): FetchMock {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = await handler(url, init ?? {})
    if (!response.url) withUrl(response, url)
    return response
  }) as unknown as FetchMock
  fn.calls = () =>
    (fn.mock.calls as Array<[RequestInfo | URL, RequestInit]>).map(([input, init]) => ({
      url:
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url,
      init,
    }))
  return fn
}

export function bridgeWith(fetchImpl: typeof fetch, config: Partial<BridgeConfig> = {}): Bridge {
  const bridge = createBridge({
    initialPage: page(),
    build: 'b1',
    fetch: fetchImpl,
    reloadDebounce: 0,
    ...config,
  })
  bridge.init()
  return bridge
}

export function header(init: RequestInit, name: string): string | undefined {
  const headers = init.headers as Record<string, string>
  return headers[name]
}

export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5))
