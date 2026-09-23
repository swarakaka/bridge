import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Emitter,
  readBuild,
  readEmbeddedPage,
  readMeta,
  createBridge,
  getBridge,
  router as lazyRouter,
  isSameOrigin,
  mergeQuery,
  relativeUrl,
  stripHash,
} from '../src/index.js'
import type { Bridge } from '../src/index.js'
import { bridgeWith, mockFetch, page, pageResponse, tick } from './helpers.js'

describe('Emitter', () => {
  it('supports once, off, count and clear', () => {
    const e = new Emitter<{ a: number }>()
    const seen: number[] = []
    const off = e.on('a', (n) => void seen.push(n))
    e.once('a', (n) => void seen.push(n * 10))
    expect(e.count('a')).toBe(2)
    e.emit('a', 1)
    e.emit('a', 2)
    expect(seen).toEqual([1, 10, 2])
    off()
    expect(e.count('a')).toBe(0)
    e.on('a', () => false)
    expect(e.emit('a', 3)).toBe(false)
    e.clear()
    expect(e.emit('a', 4)).toBe(true)
  })
})

describe('dom helpers', () => {
  it('reads the embedded page and meta tags', () => {
    document.head.innerHTML = '<meta name="bridge-build" content="abc">'
    document.body.innerHTML = `<script type="application/json" id="bridge-page">${JSON.stringify(page())}</script>`
    expect(readEmbeddedPage()?.component).toBe('Customers/Index')
    expect(readBuild()).toBe('abc')
    expect(readMeta('missing')).toBeNull()
    document.body.innerHTML = '<script type="application/json" id="bridge-page">{nope</script>'
    expect(readEmbeddedPage()).toBeNull()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })
})

describe('url helpers', () => {
  it('merges nested query data and detects origins', () => {
    const url = mergeQuery('http://localhost/x', {
      a: 1,
      b: [1, 2],
      c: { d: 'e' },
      f: null,
      g: new Date('2020-01-01T00:00:00Z'),
    })
    expect(url.search).toBe('?a=1&b%5B0%5D=1&b%5B1%5D=2&c%5Bd%5D=e&g=2020-01-01T00%3A00%3A00.000Z')
    expect(isSameOrigin('/relative')).toBe(true)
    expect(isSameOrigin('http://evil.example/')).toBe(false)
    expect(isSameOrigin('http://')).toBe(false)
    expect(relativeUrl('http://localhost/a?b=1#c')).toBe('/a?b=1#c')
    expect(stripHash('/a#b')).toBe('/a')
    expect(stripHash('/a')).toBe('/a')
  })
})

describe('createBridge extras', () => {
  let bridge: Bridge | null = null
  beforeEach(() => window.history.replaceState(null, '', '/customers'))
  afterEach(() => bridge?.destroy())

  it('exposes the lazy router proxy and getBridge', async () => {
    bridge = bridgeWith(
      mockFetch(() => pageResponse(page({ component: 'X', url: '/x', props: {} }))),
    )
    expect(getBridge()).toBe(bridge)
    await lazyRouter.visit('/x')
    expect(bridge.store.page?.component).toBe('X')
    expect(lazyRouter.page?.component).toBe('X')
    bridge.destroy()
    expect(() => getBridge()).toThrow(/not been created/)
    bridge = null
  })

  it('bootstrap returns the current page when one is embedded', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    expect((await bridge.bootstrap())?.component).toBe('Customers/Index')
  })
})

function fakeWindow(assigned: string[], href = 'http://localhost/customers'): Window {
  const win = {} as Window
  Object.defineProperty(win, 'location', {
    value: new Proxy({} as Record<string, unknown>, {
      set: (_, k, v) => {
        if (k === 'href') assigned.push(String(v))
        return true
      },
      get: (_, k) => (k === 'href' ? href : ''),
    }),
  })
  Object.defineProperty(win, 'history', { value: window.history })
  Object.defineProperty(win, 'document', { value: document })
  Object.defineProperty(win, 'addEventListener', { value: () => undefined })
  Object.defineProperty(win, 'removeEventListener', { value: () => undefined })
  return win
}

describe('Router extras', () => {
  let bridge: Bridge | null = null
  beforeEach(() => window.history.replaceState(null, '', '/customers'))
  afterEach(() => bridge?.destroy())

  it('handles 409 conflicts, 406 and cross-origin visits with hard navigation', async () => {
    const assigned: string[] = []
    const win = fakeWindow(assigned)
    const fetch = mockFetch((url) =>
      url.endsWith('/stale')
        ? new Response('', { status: 409, headers: { 'X-Bridge-Location': '/stale' } })
        : url.endsWith('/old')
          ? new Response('{}', { status: 406, headers: { 'Content-Type': 'application/json' } })
          : pageResponse(page()),
    )
    bridge = createBridge({ initialPage: page(), fetch, window: win, reloadDebounce: 0 })
    bridge.init()
    expect((await bridge.router.visit('/stale')).status).toBe('redirected')
    expect((await bridge.router.visit('/old')).status).toBe('redirected')
    expect((await bridge.router.visit('http://evil.example/x')).status).toBe('redirected')
    expect(assigned).toHaveLength(3)
    expect(assigned[0]).toBe('/stale')
    expect(assigned[1]).toContain('/old')
    expect(assigned[2]).toBe('http://evil.example/x')
  })

  it('reloads the document on csrf errors and hard-reloads on errors when configured', async () => {
    const assigned: string[] = []
    const win = fakeWindow(assigned)
    const fetch = mockFetch((url) =>
      pageResponse(
        {
          protocol: 1,
          type: 'error',
          error: {
            status: url.endsWith('/csrf') ? 419 : 500,
            kind: url.endsWith('/csrf') ? 'csrf' : 'server',
            message: 'x',
          },
        },
        { status: url.endsWith('/csrf') ? 419 : 500 },
      ),
    )
    bridge = createBridge({
      initialPage: page(),
      fetch,
      window: win,
      hardReloadOnError: true,
      reloadDebounce: 0,
    })
    bridge.init()
    await bridge.router.post('/csrf', {})
    await bridge.router.visit('/boom')
    expect(assigned[0]).toBe('http://localhost/customers')
    expect(assigned[1]).toContain('/boom')
  })

  it('reports network exceptions and cancels via cancel()', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    bridge = bridgeWith(failing)
    const exception = vi.fn()
    bridge.on('exception', exception)
    const outcome = await bridge.router.visit('/x')
    expect(outcome.status).toBe('exception')
    expect(exception).toHaveBeenCalledWith(expect.objectContaining({ kind: 'network' }))

    let resolve: (r: Response) => void = () => {}
    const slow = vi.fn(() => new Promise<Response>((r) => (resolve = r))) as unknown as typeof fetch
    bridge.destroy()
    bridge = bridgeWith(slow)
    const pending = bridge.router.visit('/slow')
    await tick()
    bridge.router.cancel()
    resolve(pageResponse(page()))
    expect((await pending).status).toBe('cancelled')
  })

  it('invalidates present keys only, navigates same-origin, and re-requests on popstate without state', async () => {
    const fetch = mockFetch(() => pageResponse(page({ props: { customers: [] } })))
    bridge = bridgeWith(fetch)
    expect(bridge.router.invalidate(['missing'])).toBeNull()
    await bridge.router.invalidate(['customers'])
    expect(fetch).toHaveBeenCalledTimes(1)
    await bridge.router.invalidate('*')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(bridge.router.navigate('http://evil.example/')).toBeNull()
    await bridge.router.navigate('/customers?page=2', true)
    expect(fetch).toHaveBeenCalledTimes(3)
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    await tick()
    expect(fetch).toHaveBeenCalledTimes(4)
    bridge.router.back()
    bridge.router.clearCache()
    expect(bridge.cache.size).toBe(0)
  })

  it('prefetch ignores cross-origin urls and failures', async () => {
    const failing = vi.fn(async () => {
      throw new Error('nope')
    }) as unknown as typeof fetch
    bridge = bridgeWith(failing)
    await bridge.router.prefetch('http://evil.example/x')
    await bridge.router.prefetch('/x')
    expect(bridge.cache.size).toBe(0)
  })

  it('serves stale cache entries then revalidates', async () => {
    let now = 0
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'X', url: '/x', props: { n: 2 } })),
    )
    bridge = createBridge({
      initialPage: page(),
      fetch,
      cache: { ttl: 1, staleWhileRevalidate: 100_000 },
      reloadDebounce: 0,
    })
    bridge.init()
    bridge.cache.set('/x', page({ component: 'X', url: '/x', props: { n: 1 } }))
    now = 50
    void now
    await new Promise((r) => setTimeout(r, 5))
    const outcome = await bridge.router.visit('/x')
    expect(outcome.status).toBe('success')
    expect((bridge.store.page?.props as Record<string, unknown>).n).toBe(2)
  })

  it('treats a page with no bridge content type in a POST as an in-page error', async () => {
    const fetch = mockFetch(
      () => new Response('<html>', { status: 500, headers: { 'Content-Type': 'text/html' } }),
    )
    bridge = bridgeWith(fetch)
    const outcome = await bridge.router.post('/x', {})
    expect(outcome.status).toBe('exception')
    expect(bridge.store.current.error?.kind).toBe('invalid_response')
  })
})

describe('Form extras', () => {
  let bridge: Bridge | null = null
  beforeEach(() => window.history.replaceState(null, '', '/customers'))
  afterEach(() => bridge?.destroy())

  it('covers the method shortcuts, error helpers and defaults', async () => {
    const calls: string[] = []
    const fetch = mockFetch((_, init) => {
      calls.push(String(init.method))
      return pageResponse(page())
    })
    bridge = bridgeWith(fetch)
    const form = bridge.form({ name: 'a', tags: ['x'] })
    await form.get('/x')
    await form.put('/x')
    await form.patch('/x')
    await form.delete('/x')
    expect(calls).toEqual(['GET', 'PUT', 'PATCH', 'DELETE'])

    form.setError({ name: ['first', 'second'], tags: 'bad' })
    expect(form.errors).toEqual({ name: 'first', tags: 'bad' })
    expect(form.allErrors.name).toEqual(['first', 'second'])
    form.clearErrors('name')
    expect(form.errors).toEqual({ tags: 'bad' })
    form.setDefaults({ name: 'z' })
    expect(form.defaults.name).toBe('z')
    form.reset('tags')
    expect(form.data.tags).toEqual(['x'])
  })
})

describe('deferred props diagnostics', () => {
  let bridge: Bridge | null = null
  afterEach(() => bridge?.destroy())

  it('warns when a deferred response is not a Bridge page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetch = mockFetch((_, init) => {
      const only = (init.headers as Record<string, string>)['X-Bridge-Only']
      if (only === 'stats')
        return new Response('<b>Notice</b>{"type":"page"}', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      return pageResponse(
        page({ component: 'Dashboard', url: '/', props: {}, deferred: { default: ['stats'] } }),
      )
    })
    bridge = bridgeWith(fetch)
    await bridge.router.visit('/')
    await tick()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('deferred props stats were not loaded'),
    )
    expect(bridge.store.current.loading.size).toBe(0)
    warn.mockRestore()
  })
})
