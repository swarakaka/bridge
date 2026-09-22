import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bridgeWith, header, mockFetch, page, pageResponse, tick, withUrl } from './helpers.js'
import type { Bridge } from '../src/createBridge.js'

let bridge: Bridge | null = null

beforeEach(() => {
  window.history.replaceState(null, '', '/customers')
})

afterEach(() => {
  bridge?.destroy()
  bridge = null
})

describe('Router.visit', () => {
  it('performs a GET visit, swaps the page and pushes history', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: { id: 1 } })),
    )
    bridge = bridgeWith(fetch)
    const navigate = vi.fn()
    bridge.on('navigate', navigate)

    const outcome = await bridge.router.visit('/customers/1')

    expect(outcome.status).toBe('success')
    expect(bridge.store.page?.component).toBe('Customers/Show')
    expect(window.location.pathname).toBe('/customers/1')
    expect(window.history.state).toMatchObject({
      bridge: true,
      page: { component: 'Customers/Show' },
    })
    expect(header(fetch.calls()[0]!.init, 'Accept')).toBe('application/vnd.bridge+json; v=1')
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Build')).toBe('b1')
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(bridge.store.current.key).toBe(1)
  })

  it('merges partial reloads into the current page and keeps state', async () => {
    const fetch = mockFetch(() => pageResponse(page({ props: { stats: { total: 5 } } })))
    bridge = bridgeWith(fetch)

    await bridge.router.reload({ only: ['stats'] })

    expect(bridge.store.page?.props).toMatchObject({ customers: [{ id: 1 }], stats: { total: 5 } })
    expect(bridge.store.current.key).toBe(0)
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('stats')
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Component')).toBe('Customers/Index')
  })

  it('coalesces concurrent reloads into one request', async () => {
    const fetch = mockFetch(() => pageResponse(page({ props: { a: 1, b: 2 } })))
    bridge = bridgeWith(fetch, { reloadDebounce: 10 })

    await Promise.all([
      bridge.router.reload({ only: ['a'] }),
      bridge.router.reload({ only: ['b'] }),
    ])

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('a,b')
  })

  it('treats a full page from a partial request as a swap when the component differs', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Login', url: '/login', props: {} })),
    )
    bridge = bridgeWith(fetch)

    await bridge.router.reload({ only: ['stats'] })

    expect(bridge.store.page?.component).toBe('Login')
    expect(bridge.store.page?.props).toEqual({})
  })

  it('delivers validation errors without touching the page', async () => {
    const fetch = mockFetch(() =>
      pageResponse(
        {
          protocol: 1,
          type: 'error',
          error: { status: 422, kind: 'validation', message: 'x', errors: { email: ['Required'] } },
        },
        { status: 422 },
      ),
    )
    bridge = bridgeWith(fetch)
    const invalid = vi.fn()
    bridge.on('invalid', invalid)

    const outcome = await bridge.router.post('/customers', { email: '' })

    expect(outcome).toMatchObject({ status: 'invalid', errors: { email: ['Required'] } })
    expect(invalid).toHaveBeenCalledTimes(1)
    expect(bridge.store.page?.component).toBe('Customers/Index')
    expect(bridge.store.current.error).toBeNull()
  })

  it('records non-validation errors on the store when no listener handles them', async () => {
    const fetch = mockFetch(() =>
      pageResponse(
        { protocol: 1, type: 'error', error: { status: 403, kind: 'forbidden', message: 'Nope' } },
        { status: 403 },
      ),
    )
    bridge = bridgeWith(fetch)

    const outcome = await bridge.router.visit('/customers/1/edit')

    expect(outcome.status).toBe('error')
    expect(bridge.store.current.error).toEqual({ status: 403, kind: 'forbidden', message: 'Nope' })
  })

  it('lets error listeners take over by returning false', async () => {
    const fetch = mockFetch(() =>
      pageResponse(
        { protocol: 1, type: 'error', error: { status: 404, kind: 'not_found', message: 'x' } },
        { status: 404 },
      ),
    )
    bridge = bridgeWith(fetch)
    bridge.on('error', () => false)

    await bridge.router.visit('/missing')

    expect(bridge.store.current.error).toBeNull()
  })

  it('follows unauthenticated redirects with a page visit', async () => {
    const fetch = mockFetch((url) =>
      url.endsWith('/login')
        ? pageResponse(page({ component: 'Login', url: '/login', props: {} }))
        : pageResponse(
            {
              protocol: 1,
              type: 'error',
              error: { status: 401, kind: 'unauthenticated', message: 'x', redirect: '/login' },
            },
            { status: 401 },
          ),
    )
    bridge = bridgeWith(fetch)

    await bridge.router.visit('/secret')
    await tick()

    expect(bridge.store.page?.component).toBe('Login')
    expect(window.location.pathname).toBe('/login')
  })

  it('uses the final URL after a redirect for history', async () => {
    const fetch = mockFetch(() =>
      withUrl(
        pageResponse(page({ component: 'Customers/Show', url: '/customers/9', props: {} })),
        'http://localhost/customers/9',
      ),
    )
    bridge = bridgeWith(fetch)

    await bridge.router.post('/customers', { name: 'x' })

    expect(window.location.pathname).toBe('/customers/9')
    expect(bridge.store.page?.component).toBe('Customers/Show')
  })

  it('cancels an in-flight visit when a new one starts', async () => {
    let resolveFirst: (r: Response) => void = () => {}
    const fetch = mockFetch((url) =>
      url.endsWith('/slow')
        ? new Promise<Response>((resolve) => (resolveFirst = resolve))
        : pageResponse(page({ component: 'Fast', url: '/fast', props: {} })),
    )
    bridge = bridgeWith(fetch)
    const cancel = vi.fn()
    bridge.on('cancel', cancel)

    const slow = bridge.router.visit('/slow')
    const fast = bridge.router.visit('/fast')
    resolveFirst(pageResponse(page({ component: 'Slow', url: '/slow', props: {} })))

    expect((await fast).status).toBe('success')
    expect((await slow).status).toBe('cancelled')
    expect(bridge.store.page?.component).toBe('Fast')
  })

  it('emits an exception for non-bridge responses and lets listeners prevent the reload', async () => {
    const fetch = mockFetch(
      () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )
    bridge = bridgeWith(fetch)
    const exception = vi.fn((e: { preventDefault(): void }) => e.preventDefault())
    bridge.on('exception', exception)

    const outcome = await bridge.router.visit('/somewhere')

    expect(outcome.status).toBe('exception')
    expect(exception).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/customers')
  })

  it('can be cancelled from onBefore and the before event', async () => {
    const fetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(fetch)

    expect((await bridge.router.visit('/x', { onBefore: () => false })).status).toBe('cancelled')
    bridge.on('before', () => false)
    expect((await bridge.router.visit('/y')).status).toBe('cancelled')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('deferred props', () => {
  it('loads deferred groups after a page swap and marks them loading', async () => {
    const fetch = mockFetch((url, init) => {
      const only = header(init, 'X-Bridge-Only')
      if (only === 'stats')
        return pageResponse(page({ component: 'Dashboard', url: '/', props: { stats: { n: 1 } } }))
      if (only === 'chart')
        return pageResponse(page({ component: 'Dashboard', url: '/', props: { chart: [1] } }))
      return pageResponse(
        page({
          component: 'Dashboard',
          url: '/',
          props: { recent: [] },
          deferred: { default: ['stats'], charts: ['chart'] },
        }),
      )
    })
    bridge = bridgeWith(fetch)

    await bridge.router.visit('/')
    expect(bridge.store.current.loading.has('stats')).toBe(true)
    await tick()

    expect(bridge.store.page?.props).toEqual({ recent: [], stats: { n: 1 }, chart: [1] })
    expect(bridge.store.current.loading.size).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(window.history.state.page.props.stats).toEqual({ n: 1 })
  })
})

describe('prefetch and cache', () => {
  it('serves a fresh prefetched page without a request', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Customers/Show', url: '/customers/2', props: { id: 2 } })),
    )
    bridge = bridgeWith(fetch)

    await bridge.router.prefetch('/customers/2')
    expect(header(fetch.calls()[0]!.init, 'Purpose')).toBe('prefetch')

    await bridge.router.visit('/customers/2')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(bridge.store.page?.component).toBe('Customers/Show')
    expect(window.location.pathname).toBe('/customers/2')
  })

  it('clears the cache after mutations', async () => {
    const fetch = mockFetch(() => pageResponse(page({ component: 'X', url: '/x', props: {} })))
    bridge = bridgeWith(fetch)
    await bridge.router.prefetch('/x')
    expect(bridge.cache.size).toBe(1)
    await bridge.router.post('/x', {})
    expect(bridge.cache.size).toBe(0)
  })
})

describe('history', () => {
  it('restores pages from history state on popstate without a request', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: { id: 1 } })),
    )
    bridge = bridgeWith(fetch)
    await bridge.router.visit('/customers/1')

    // jsdom's history.back() fires its own asynchronous popstate; dispatch a synthetic one instead.
    const previous = {
      bridge: true,
      page: page(),
      key: 0,
      scroll: { window: [0, 0], regions: [] },
      remember: {},
    }
    window.dispatchEvent(new PopStateEvent('popstate', { state: previous }))
    await tick()

    expect(bridge.store.page?.component).toBe('Customers/Index')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('remembers and restores component state', () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    bridge.router.remember('form', { name: 'x' })
    expect(bridge.router.restore('form')).toEqual({ name: 'x' })
  })
})

describe('bootstrap', () => {
  it('fetches the current page when none is embedded', async () => {
    const fetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(fetch, { initialPage: null })
    expect(bridge.store.page).toBeNull()
    await bridge.bootstrap()
    expect(bridge.store.page?.component).toBe('Customers/Index')
  })
})
