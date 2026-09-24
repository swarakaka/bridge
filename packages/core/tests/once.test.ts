import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { OnceStore, type Bridge } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse, tick } from './helpers.js'

let bridge: Bridge | null = null

beforeEach(() => {
  window.history.replaceState(null, '', '/customers/create')
})

afterEach(() => {
  bridge?.destroy()
  bridge = null
  vi.useRealTimers()
})

const STATUSES = ['active', 'inactive']
const onceMeta = (expiresAt: number | null = null) => ({
  once: { statuses: { key: 'customer-statuses', expiresAt } },
})

/** A page carrying the once prop, or leaving it out as the server does for a holder. */
const create = (withValue = true, expiresAt: number | null = null): BridgePage =>
  page({
    component: 'Customers/Create',
    url: '/customers/create',
    props: withValue ? { statuses: STATUSES } : {},
    meta: onceMeta(expiresAt),
  })
const edit = (withValue: boolean): BridgePage =>
  page({
    component: 'Customers/Edit',
    url: '/customers/2/edit',
    props: withValue ? { customer: { id: 2 }, statuses: STATUSES } : { customer: { id: 2 } },
    meta: onceMeta(),
  })

/** The server: leaves the value out when the request announced its key. */
function server() {
  return mockFetch((url, init) => {
    const held = (header(init, 'X-Bridge-Once') ?? '').split(',').includes('customer-statuses')
    const only = header(init, 'X-Bridge-Only')
    const named = only?.split(',').includes('statuses') ?? false
    return pageResponse(url.includes('/edit') ? edit(!held || named) : create(!held || named))
  })
}

describe('OnceStore', () => {
  it('announces only unexpired keys and fills omitted values', () => {
    let now = 1000
    const store = new OnceStore({ now: () => now })
    store.complete(create(true, 2000))
    expect(store.heldKeys()).toEqual(['customer-statuses'])

    const { page: filled, missing } = store.complete(edit(false))
    expect(filled.props).toEqual({ customer: { id: 2 }, statuses: STATUSES })
    expect(missing).toEqual([])

    now = 2000
    expect(store.heldKeys()).toEqual([])
    expect(store.complete(edit(false)).missing).toEqual(['statuses'])
  })

  it('does not extend an expiry from a response without the value', () => {
    let now = 0
    const store = new OnceStore({ now: () => now })
    store.complete(create(true, 100))
    store.complete(page({ props: {}, meta: onceMeta(10_000) }))
    now = 100
    expect(store.heldKeys()).toEqual([])
  })
})

describe('once props in the router', () => {
  it('remembers the embedded value, announces it, and fills the omitted value', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: create() })

    await bridge.router.visit('/customers/2/edit')

    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Once')).toBe('customer-statuses')
    expect(bridge.store.page?.props).toEqual({ customer: { id: 2 }, statuses: STATUSES })
    // History holds the complete page, so back/forward needs no store.
    expect(window.history.state.page.props.statuses).toEqual(STATUSES)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stores a value on first sight and passes the completed page to callbacks', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: page() })
    await bridge.router.visit('/customers/create')
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Once')).toBeUndefined()

    let seen: unknown = null
    await bridge.router.visit('/customers/2/edit', { onSuccess: (p) => (seen = p.props) })
    expect(header(fetch.calls()[1]!.init, 'X-Bridge-Once')).toBe('customer-statuses')
    expect(seen).toMatchObject({ statuses: STATUSES })
  })

  it('stops announcing an expired value', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000)
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: create(true, 5_000) })
    vi.setSystemTime(5_000)

    await bridge.router.visit('/customers/2/edit')

    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Once')).toBeUndefined()
    expect(bridge.store.page?.props).toMatchObject({ statuses: STATUSES })
  })

  it('requests a value the store lost while the response was on its way', async () => {
    let first = true
    const inner = server()
    const fetch = mockFetch(async (url, init) => {
      const response = await inner(url, init)
      if (first) {
        first = false
        bridge!.once.clear()
      }
      return response
    })
    bridge = bridgeWith(fetch, { initialPage: create() })

    await bridge.router.visit('/customers/2/edit')
    await tick()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(header(fetch.calls()[1]!.init, 'X-Bridge-Only')).toBe('statuses')
    expect(bridge.store.page?.props).toMatchObject({ statuses: STATUSES })
  })

  it('refreshes the stored value from a reload naming the prop', async () => {
    const fetch = mockFetch(() =>
      pageResponse(
        page({
          component: 'Customers/Create',
          url: '/customers/create',
          props: { statuses: ['archived'] },
          meta: onceMeta(),
        }),
      ),
    )
    bridge = bridgeWith(fetch, { initialPage: create() })
    await bridge.router.reload({ only: ['statuses'] })

    const { page: filled } = bridge.once.complete(edit(false))
    expect(filled.props).toMatchObject({ statuses: ['archived'] })
  })

  it('sends the header on prefetches and completes the cached page when used', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: create() })
    await bridge.router.prefetch('/customers/2/edit')
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Once')).toBe('customer-statuses')

    await bridge.router.visit('/customers/2/edit')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(bridge.store.page?.props).toMatchObject({ statuses: STATUSES })
  })

  it('forgets values on 401/403/419, clearCache and a history clear, never on mutations', async () => {
    const fetch = mockFetch((url) => {
      if (url.endsWith('/forbidden'))
        return pageResponse(
          { protocol: 1, type: 'error', error: { status: 403, kind: 'forbidden', message: 'x' } },
          { status: 403 },
        )
      if (url.endsWith('/logout'))
        return pageResponse(
          page({ component: 'Login', url: '/login', meta: { clearHistory: true } }),
        )
      return pageResponse(create())
    })

    bridge = bridgeWith(fetch, { initialPage: create() })
    await bridge.router.post('/customers', { name: 'x' })
    expect(bridge.once.size).toBe(1)
    await bridge.router.visit('/forbidden')
    expect(bridge.once.size).toBe(0)

    bridge.once.complete(create())
    bridge.router.clearCache()
    expect(bridge.once.size).toBe(0)

    bridge.once.complete(create())
    await bridge.router.post('/logout')
    expect(bridge.once.size).toBe(0)
  })

  it('never announces once keys on JSON-mode requests', async () => {
    const fetch = mockFetch(
      () => new Response('{"data":{}}', { headers: { 'Content-Type': 'application/json' } }),
    )
    bridge = bridgeWith(fetch, { initialPage: create() })
    await bridge.json.get('/customers')
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Once')).toBeUndefined()
  })
})
