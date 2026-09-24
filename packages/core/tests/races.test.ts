import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bridgeWith, header, mockFetch, page, pageResponse, tick } from './helpers.js'
import type { Bridge } from '../src/index.js'

let bridge: Bridge | null = null

beforeEach(() => window.history.replaceState(null, '', '/customers'))
afterEach(() => {
  bridge?.destroy()
  bridge = null
})

/** A fetch whose responses are released by hand, in any order. */
function deferredFetch() {
  const pending: Array<{ url: string; init: RequestInit; resolve: (r: Response) => void }> = []
  const fetchImpl = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
        pending.push({
          url,
          init: init ?? {},
          resolve: (r) => {
            Object.defineProperty(r, 'url', { value: url })
            resolve(r)
          },
        })
      }),
  ) as unknown as typeof fetch
  return { fetch: fetchImpl, pending }
}

const validationError = (errors: Record<string, string[]>) =>
  pageResponse(
    {
      protocol: 1,
      type: 'error',
      error: { status: 422, kind: 'validation', message: 'x', errors },
    },
    { status: 422 },
  )

describe('router races', () => {
  it('lets a navigation finish when a reload is requested meanwhile, then drops the stale reload', async () => {
    const http = deferredFetch()
    bridge = bridgeWith(http.fetch)

    const visit = bridge.router.visit('/customers/1')
    await tick()
    const reload = bridge.router.invalidate(['customers'])!
    await tick()
    await tick()

    // The reload waited instead of aborting the visit.
    expect(http.pending).toHaveLength(1)
    http.pending[0]!.resolve(
      pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: { id: 1 } })),
    )
    expect((await visit).status).toBe('success')
    // The page it was meant for is gone, so it does not run.
    expect(await reload).toEqual({ status: 'cancelled' })
    expect(http.pending).toHaveLength(1)
    expect(bridge.store.page?.component).toBe('Customers/Show')
  })

  it('runs a reload queued during a submit that stays on the page', async () => {
    const http = deferredFetch()
    bridge = bridgeWith(http.fetch)
    const form = bridge.form({ name: '' })

    const submit = form.post('/customers')
    await tick()
    const reload = bridge.router.invalidate(['customers'])!
    await tick()
    http.pending[0]!.resolve(validationError({ name: ['Required'] }))
    expect((await submit).status).toBe('invalid')
    await tick()
    await tick()

    expect(http.pending).toHaveLength(2)
    expect(header(http.pending[1]!.init, 'X-Bridge-Only')).toBe('customers')
    http.pending[1]!.resolve(pageResponse(page({ props: { customers: [{ id: 2 }] } })))
    expect((await reload).status).toBe('success')
    expect(bridge.store.page?.props).toMatchObject({ customers: [{ id: 2 }] })
  })

  it('validates beside a submit without aborting it or touching router events', async () => {
    const http = deferredFetch()
    bridge = bridgeWith(http.fetch)
    const form = bridge.form({ name: '', email: 'x' })
    const start = vi.fn()
    bridge.on('start', start)

    const submit = form.post('/customers')
    await tick()
    const validation = form.validate('post', '/customers', 'email')
    await tick()

    expect(http.pending).toHaveLength(2)
    expect(start).toHaveBeenCalledTimes(1)
    http.pending[1]!.resolve(validationError({ email: ['Invalid'] }))
    expect((await validation).status).toBe('invalid')
    expect(form.validating).toBe(false)
    expect(form.processing).toBe(true)

    http.pending[0]!.resolve(
      pageResponse(page({ component: 'Customers/Show', url: '/customers/9', props: {} })),
    )
    expect((await submit).status).toBe('success')
  })

  it('lets a newer validation supersede an older one', async () => {
    const http = deferredFetch()
    bridge = bridgeWith(http.fetch)
    const form = bridge.form({ email: 'x' })

    const first = form.validate('post', '/customers', 'email')
    await tick()
    const second = form.validate('post', '/customers', 'email')
    await tick()

    expect((await first).status).toBe('cancelled')
    expect(form.validating).toBe(true)
    http.pending[1]!.resolve(new Response(null, { status: 204 }))
    expect((await second).status).toBe('success')
    expect(form.validating).toBe(false)
  })

  it('resets processing when onBefore refuses the submit', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ name: '' })

    const outcome = await form.post('/customers', { onBefore: () => false })

    expect(outcome.status).toBe('cancelled')
    expect(form.processing).toBe(false)
  })

  it('does not paint a cached page over a newer visit while its component loads', async () => {
    let releaseShow: () => void = () => undefined
    const fetch = mockFetch((url) =>
      url.includes('/customers/1')
        ? pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: {} }))
        : pageResponse(page({ component: 'Dashboard', url: '/dashboard', props: {} })),
    )
    bridge = bridgeWith(fetch, {
      prepare: (p) =>
        p.component === 'Customers/Show'
          ? new Promise<void>((resolve) => (releaseShow = resolve))
          : undefined,
    })
    await bridge.router.prefetch('/customers/1')

    const slow = bridge.router.visit('/customers/1')
    await tick()
    await bridge.router.visit('/dashboard')
    releaseShow()

    expect((await slow).status).toBe('cancelled')
    expect(bridge.store.page?.component).toBe('Dashboard')
  })

  it('clears the page cache on invalidation', async () => {
    let n = 0
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: { n: ++n } })),
    )
    bridge = bridgeWith(fetch)
    await bridge.router.prefetch('/customers/1')

    await bridge.router.invalidate(['customers'])
    await bridge.router.visit('/customers/1')

    // prefetch, reload, then a real request instead of the cached copy
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('clears the page cache after a JSON-mode mutation', async () => {
    const fetch = mockFetch((url, init) =>
      init.method === 'POST'
        ? new Response('{"data":null}', {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        : pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: {} })),
    )
    bridge = bridgeWith(fetch)
    await bridge.router.prefetch('/customers/1')

    await bridge.json.post('/customers', { data: { name: 'Acme' } })
    await bridge.router.visit('/customers/1')

    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('records the booted page even when history holds an older one', () => {
    window.history.replaceState(
      {
        bridge: true,
        page: page({ props: { stale: true } }),
        key: 0,
        scroll: { window: [0, 0], regions: [] },
        remember: { tab: 2 },
      },
      '',
      '/customers',
    )
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))

    expect(window.history.state.page.props).toEqual(page().props)
    expect(window.history.state.remember).toEqual({ tab: 2 })
  })

  it('applies only the latest of two quick back/forward restores', async () => {
    const releases: Array<() => void> = []
    bridge = bridgeWith(
      mockFetch(() => pageResponse(page())),
      {
        prepare: () => new Promise<void>((resolve) => releases.push(resolve)),
      },
    )
    const state = (component: string) => ({
      bridge: true,
      page: page({ component, url: '/x', props: {} }),
      key: 1,
      scroll: { window: [0, 0], regions: [] },
      remember: {},
    })

    window.dispatchEvent(new PopStateEvent('popstate', { state: state('Older') }))
    window.dispatchEvent(new PopStateEvent('popstate', { state: state('Newer') }))
    releases[1]!()
    await tick()
    releases[0]!()
    await tick()

    expect(bridge.store.page?.component).toBe('Newer')
  })

  it('stops a pending reload on destroy', async () => {
    const fetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(fetch, { reloadDebounce: 20 })

    void bridge.router.reload()
    bridge.destroy()
    await new Promise((r) => setTimeout(r, 40))

    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('stream races', () => {
  const sseResponse = () =>
    new Response(new ReadableStream({ start() {} }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })

  it('does not connect when closed while the URL is being resolved', async () => {
    const fetch = vi.fn(async () => sseResponse()) as unknown as typeof globalThis.fetch
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    let resolveUrl: (url: string) => void = () => undefined
    const stream = bridge.stream('/events', {
      fetch,
      resolveUrl: () => new Promise<string>((r) => (resolveUrl = r)),
    })

    stream.close()
    resolveUrl('/events?ticket=1')
    await tick()

    expect(fetch).not.toHaveBeenCalled()
    expect(stream.state).toBe('closed')
  })

  it('retries after resolveUrl rejects', async () => {
    const fetch = vi.fn(async () => sseResponse()) as unknown as typeof globalThis.fetch
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    let calls = 0
    const errors: unknown[] = []
    const stream = bridge.stream('/events', {
      fetch,
      backoff: { initial: 1, max: 1, jitter: 0 },
      resolveUrl: async () => {
        if (++calls === 1) throw new Error('ticket endpoint down')
        return '/events'
      },
    })
    stream.on('error', (e) => errors.push(e))
    await tick()
    await tick()

    expect(errors[0]).toMatchObject({ type: 'transport' })
    expect(calls).toBe(2)
    expect(fetch).toHaveBeenCalledTimes(1)
    stream.close()
  })

  it('opens one connection when woken while a reconnect is already under way', async () => {
    let release: (r: Response) => void = () => undefined
    let n = 0
    const fetch = vi.fn(() =>
      ++n === 1
        ? Promise.reject(new TypeError('network down'))
        : new Promise<Response>((r) => (release = r)),
    ) as unknown as typeof globalThis.fetch
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const stream = bridge.stream('/events', { fetch, backoff: { initial: 1, max: 1, jitter: 0 } })
    await tick()
    await tick()

    // The retry is in flight; waking the tab must not start a second one.
    expect(fetch).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('online'))
    await tick()
    expect(fetch).toHaveBeenCalledTimes(2)
    release(sseResponse())
    await tick()
    expect(stream.state).toBe('open')
    stream.close()
  })

  it('ignores a ready event without a usable heartbeat', async () => {
    const encoder = new TextEncoder()
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    const fetch = vi.fn(
      async () =>
        new Response(new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    ) as unknown as typeof globalThis.fetch
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const stream = bridge.stream('/events', { fetch })
    const ready = vi.fn()
    stream.on('ready', ready)
    await tick()

    controller!.enqueue(encoder.encode('event: bridge\ndata: {"type":"ready","protocol":1}\n\n'))
    controller!.enqueue(
      encoder.encode('event: bridge\ndata: {"type":"invalidate","keys":"customers"}\n\n'),
    )
    await tick()

    expect(ready).not.toHaveBeenCalled()
    expect(stream.state).toBe('open')
    stream.close()
  })

  it('keeps growing the backoff while the server throttles the connection', async () => {
    const throttled =
      'retry: 20\nevent: bridge\ndata: {"type":"ready","protocol":1,"replayed":false,"heartbeat":15000,"maxDuration":null}\n\n' +
      'event: bridge\ndata: {"type":"error","status":429,"kind":"throttled","message":"busy","final":false}\n\n'
    const fetch = vi.fn(
      async () =>
        new Response(throttled, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    ) as unknown as typeof globalThis.fetch
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const stream = bridge.stream('/events', {
      fetch,
      backoff: { factor: 4, jitter: 0, max: 10_000 },
    })

    // Delays 20 ms, then 80 ms: two attempts by 70 ms (a reset on `ready` would make it four).
    await new Promise((r) => setTimeout(r, 70))
    expect(fetch).toHaveBeenCalledTimes(2)
    stream.close()
  })
})
