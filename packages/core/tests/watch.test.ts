import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { base64url, ClientIdentity, sha256 } from '../src/http/clientIdentity.js'
import { mergePartialMeta, tagMatches, watchingProps, type Bridge } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse, tick } from './helpers.js'

let bridge: Bridge | null = null

beforeEach(() => {
  window.history.replaceState(null, '', '/customers')
})

afterEach(() => {
  bridge?.destroy()
  bridge = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const WATCH = {
  customers: ['customers'],
  stats: ['customers', 'orders'],
  customer: ['customers.3'],
}

/** The customers page with watched props; `only` keeps the server's partial selection. */
function listPage(only?: string[]): BridgePage {
  const props: Record<string, unknown> = {
    customers: [{ id: 1 }],
    stats: { total: 1 },
    customer: { id: 3 },
    filters: {},
  }
  const keys = only ?? Object.keys(props)
  const pick = <T>(source: Record<string, T>) =>
    Object.fromEntries(Object.entries(source).filter(([k]) => keys.includes(k)))
  return page({
    props: pick(props),
    meta: { watch: pick(WATCH) } as NonNullable<BridgePage['meta']>,
  })
}

/** A server answering every request with the (partial) customers page. */
function server(gate?: Promise<void>) {
  return mockFetch(async (url, init) => {
    if (gate && init.method === 'POST') await gate
    if (url.includes('/api/')) {
      return new Response('{"data":{"id":9}}', {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const only = header(init, 'X-Bridge-Only')
    return pageResponse(listPage(only ? only.split(',') : undefined))
  })
}

const seqOf = (init: RequestInit): number => Number(header(init, 'X-Bridge-Client')!.split('.')[1])

function gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release }
}

describe('ClientIdentity', () => {
  const hex = (bytes: Uint8Array) =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const ascii = (s: string) => new TextEncoder().encode(s)

  it('computes SHA-256', () => {
    expect(hex(sha256(ascii('')))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(hex(sha256(ascii('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    // Two blocks: the padding does not fit after 56 bytes.
    expect(hex(sha256(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
  })

  it('matches the hash in the protocol fixture and recognises its own messages', () => {
    const identity = new ClientIdentity('Zm9vYmFyYmF6cXV4cXV1eA')
    expect(identity.hash).toBe('ZnlfgKAmTkeQjF2rdZN7Lg')
    expect(identity.own('ZnlfgKAmTkeQjF2rdZN7Lg.7')).toBe(7)
    expect(identity.own('AAAAAAAAAAAAAAAAAAAAAA.7')).toBeNull()
    expect(identity.own('ZnlfgKAmTkeQjF2rdZN7Lg.x')).toBeNull()
    expect(identity.own('ZnlfgKAmTkeQjF2rdZN7Lg')).toBeNull()
  })

  it('creates a random 22-character token', () => {
    const a = new ClientIdentity()
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(new ClientIdentity().token).not.toBe(a.token)
  })

  it('orders request starts and settles and forgets old requests', () => {
    const identity = new ClientIdentity('Zm9vYmFyYmF6cXV4cXV1eA')
    const one = identity.begin()
    const two = identity.begin()
    expect(one.header).toBe('Zm9vYmFyYmF6cXV4cXV1eA.1')
    identity.settle(one.seq)
    const three = identity.begin()
    expect(identity.startedAfterSettled(three.seq, one.seq)).toBe(true)
    expect(identity.startedAfterSettled(two.seq, one.seq)).toBe(false)
    expect(identity.startedAfterSettled(three.seq, two.seq)).toBe(false)
    for (let i = 0; i < 100; i++) identity.begin()
    expect(identity.known(one.seq)).toBe(false)
    expect(identity.startedAfterSettled(three.seq, one.seq)).toBe(false)
  })
})

describe('X-Bridge-Client', () => {
  it('numbers every request of one client with the same token', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })
    const token = bridge.http.identity!.token

    await bridge.router.visit('/customers?page=2')
    await bridge.router.reload({ only: ['stats'] })
    await bridge.router.prefetch('/other')
    await bridge.router.request('/customers', { only: ['stats'] })
    await bridge.json.request('post', '/api/customers', {})

    const values = fetch.calls().map((c) => header(c.init, 'X-Bridge-Client'))
    expect(values).toEqual([1, 2, 3, 4, 5].map((n) => `${token}.${n}`))
  })
})

describe('watch tags', () => {
  it('matches equal tags and trailing wildcards', () => {
    expect(tagMatches('customers', 'customers')).toBe(true)
    expect(tagMatches('customers.*', 'customers')).toBe(true)
    expect(tagMatches('customers.*', 'customers.12')).toBe(true)
    expect(tagMatches('customers.*', 'customersx')).toBe(false)
    expect(tagMatches('customers', 'customers.12')).toBe(false)
    expect(tagMatches('customers.12', 'customers')).toBe(false)
  })

  it('selects the props watching a published tag', () => {
    expect(watchingProps(listPage(), ['orders'])).toEqual(['stats'])
    expect(watchingProps(listPage(), ['customers', 'customers.4'])).toEqual(['customers', 'stats'])
    expect(watchingProps(listPage(), ['customers.*'])).toEqual(['customers', 'stats', 'customer'])
    expect(watchingProps(page(), ['customers'])).toEqual([])
  })

  it('keeps meta.watch of props a partial response does not carry', () => {
    const merged = mergePartialMeta(listPage().meta, listPage(['stats']))
    expect((merged as Record<string, unknown>).watch).toEqual(WATCH)
  })
})

describe('router.invalidateTags', () => {
  it('reloads the watching props with the keys in one request', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    await bridge.router.invalidateTags(['orders'], { keys: ['filters'] })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('filters,stats')
  })

  it('sends nothing when no prop on the page watches the tags', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    expect(await bridge.router.invalidateTags(['invoices'])).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('hands an infinite-scroll prop to its invalidation handler', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })
    const handler = vi.fn()
    bridge.router.handleInvalidation('customers', handler)

    await bridge.router.invalidateTags(['customers'])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('stats')
  })

  it('reloads a prop another client changed even while this client saves', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    await bridge.router.invalidateTags(['customers'], {
      client: 'AAAAAAAAAAAAAAAAAAAAAA.1',
    })

    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('customers,stats')
  })
})

describe('changes made by this client', () => {
  it('sends no reload after a visit whose page is still arriving', async () => {
    const { promise, release } = gate()
    const fetch = server(promise)
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    const saving = bridge.router.post('/customers', { name: 'Acme' })
    await tick()
    const client = `${bridge.http.identity!.hash}.${seqOf(fetch.calls()[0]!.init)}`
    // The stream message arrives before the redirected page.
    const invalidation = bridge.router.invalidateTags(['customers', 'customers.3'], { client })
    await tick()
    release()
    await saving

    expect(await invalidation).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('sends no reload after the visit delivered the props', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    await bridge.router.post('/customers', { name: 'Acme' })
    const client = `${bridge.http.identity!.hash}.${seqOf(fetch.calls()[0]!.init)}`
    await bridge.router.invalidateTags(['customers'], { client })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('counts props delivered by a request started after the change settled', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    await bridge.json.request('post', '/api/customers', {})
    const client = `${bridge.http.identity!.hash}.${seqOf(fetch.calls()[0]!.init)}`
    await bridge.router.reload({ only: ['stats'] })
    await bridge.router.invalidateTags(['customers'], { client })

    // stats came after the change; customers is older.
    expect(header(fetch.calls()[2]!.init, 'X-Bridge-Only')).toBe('customers')
  })

  it('reloads once after a JSON save, which delivers no props', async () => {
    const { promise, release } = gate()
    const fetch = server(promise)
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    const saving = bridge.json.request('post', '/api/customers', {})
    await tick()
    const client = `${bridge.http.identity!.hash}.${seqOf(fetch.calls()[0]!.init)}`
    const invalidation = bridge.router.invalidateTags(['customers'], { client })
    release()
    await saving
    await invalidation

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(header(fetch.calls()[1]!.init, 'X-Bridge-Only')).toBe('customers,stats')
  })

  it('reloads a prop delivered by a request that overlapped the change', async () => {
    const { promise, release } = gate()
    const fetch = server(promise)
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    const saving = bridge.json.request('post', '/api/customers', {})
    await tick()
    // Started before the save settled: the server may have read old data.
    await bridge.router.reload({ only: ['customers'] })
    release()
    await saving
    const client = `${bridge.http.identity!.hash}.${seqOf(fetch.calls()[0]!.init)}`
    await bridge.router.invalidateTags(['customers'], { client })

    expect(header(fetch.calls()[2]!.init, 'X-Bridge-Only')!.split(',').sort()).toEqual([
      'customers',
      'stats',
    ])
  })

  it('reloads values patched in, restored or unknown', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })

    await bridge.router.visit('/customers', { method: 'post' })
    const own = `${bridge.http.identity!.hash}.${seqOf(fetch.calls()[0]!.init)}`
    bridge.router.patchProps({ stats: { total: 2 } })
    await bridge.router.invalidateTags(['customers'], { client: own })
    expect(header(fetch.calls()[1]!.init, 'X-Bridge-Only')).toBe('stats')

    // A request this client no longer remembers.
    await bridge.router.invalidateTags(['orders'], {
      client: `${bridge.http.identity!.hash}.999`,
    })
    expect(header(fetch.calls()[2]!.init, 'X-Bridge-Only')).toBe('stats')
  })
})

describe('watchSpread', () => {
  it('delays reloads for other clients, not for this one', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage(), watchSpread: 1000 })

    void bridge.router.invalidateTags(['orders'])
    await vi.advanceTimersByTimeAsync(499)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10)
    expect(fetch).toHaveBeenCalledTimes(1)

    void bridge.router.invalidateTags(['orders'], {
      client: `${bridge.http.identity!.hash}.999`,
    })
    await vi.advanceTimersByTimeAsync(20)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('stream wiring', () => {
  function sseFetch() {
    const encoder = new TextEncoder()
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              controller = c
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
    ) as unknown as typeof fetch
    return { fetch: fetchImpl, send: (t: string) => controller?.enqueue(encoder.encode(t)) }
  }
  const ready =
    'event: bridge\ndata: {"type":"ready","protocol":1,"replayed":false,"heartbeat":100000,"maxDuration":null}\n\n'

  it('routes tagged invalidations to the watching props', async () => {
    const sse = sseFetch()
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })
    const stream = bridge.stream('/events', { fetch: sse.fetch })
    await tick()
    sse.send(ready)
    sse.send('event: bridge\ndata: {"type":"invalidate","keys":[],"tags":["orders"]}\n\n')
    await tick()
    await tick()

    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('stats')
    stream.close()
  })

  it('ignores an empty keys list without tags, as clients before watch tags do', async () => {
    const sse = sseFetch()
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage() })
    const stream = bridge.stream('/events', { fetch: sse.fetch })
    await tick()
    sse.send(ready)
    sse.send('event: bridge\ndata: {"type":"invalidate","keys":[]}\n\n')
    await tick()
    await tick()

    expect(fetch).not.toHaveBeenCalled()
    stream.close()
  })

  it('warns when a page with watched props has no stream', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge = bridgeWith(server(), { initialPage: listPage() })
    await vi.advanceTimersByTimeAsync(3000)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('Customers/Index has watched props')
  })

  it('does not warn while a stream is open', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge = bridgeWith(server(), { initialPage: listPage() })
    const stream = bridge.stream('/events', { fetch: sseFetch().fetch, autoConnect: false })
    await vi.advanceTimersByTimeAsync(3000)

    expect(warn).not.toHaveBeenCalled()
    stream.close()
  })
})
