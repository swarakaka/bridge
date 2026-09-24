import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Backoff, SseParser } from '../src/index.js'
import type { SseEvent, Bridge } from '../src/index.js'
import { bridgeWith, mockFetch, page, pageResponse, header, tick } from './helpers.js'

describe('SseParser', () => {
  function parse(chunks: string[]): { events: SseEvent[]; comments: string[]; retry: number[] } {
    const events: SseEvent[] = []
    const comments: string[] = []
    const retry: number[] = []
    const parser = new SseParser({
      onEvent: (e) => events.push(e),
      onComment: (c) => comments.push(c),
      onRetry: (ms) => retry.push(ms),
    })
    for (const chunk of chunks) parser.feed(chunk)
    parser.end()
    return { events, comments, retry }
  }

  it('parses events, ids, retry and comments across chunk boundaries', () => {
    const { events, comments, retry } = parse([
      'retry: 3000\nevent: bridge\ndata: {"type":"re',
      'ady"}\n\n: hb\n\nid: 5\nevent: customer.created\ndata: {"id":1}\n\n',
    ])
    expect(retry).toEqual([3000])
    expect(comments).toEqual(['hb'])
    expect(events).toEqual([
      { event: 'bridge', data: '{"type":"ready"}', id: null, retry: 3000 },
      { event: 'customer.created', data: '{"id":1}', id: '5', retry: 3000 },
    ])
  })

  it('handles CRLF, multi-line data and a missing trailing blank line', () => {
    const { events } = parse(['data: a\r\ndata: b\r\n\r\nevent: x\r\ndata: last'])
    expect(events[0]).toMatchObject({ event: 'message', data: 'a\nb' })
    expect(events[1]).toMatchObject({ event: 'x', data: 'last' })
  })

  it('remembers the last id for later events', () => {
    const { events } = parse(['id: 9\ndata: one\n\ndata: two\n\n'])
    expect(events.map((e) => e.id)).toEqual(['9', '9'])
  })
})

describe('Backoff', () => {
  it('grows exponentially with jitter and caps at max', () => {
    const b = new Backoff({ initial: 100, max: 1000, factor: 2, jitter: 0, random: () => 0.5 })
    expect([b.next(), b.next(), b.next(), b.next(), b.next()]).toEqual([100, 200, 400, 800, 1000])
    b.reset()
    expect(b.next(50)).toBe(50)
  })
})

/** A fetch mock that serves an SSE body from a controllable stream. */
function sseFetch() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const requests: RequestInit[] = []
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {})
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      },
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }) as unknown as typeof fetch
  return {
    fetch: fetchImpl,
    requests,
    send: (text: string) => controller?.enqueue(encoder.encode(text)),
    close: () => controller?.close(),
  }
}

const ready = (extra = '') =>
  `retry: 10\nevent: bridge\ndata: {"type":"ready","protocol":1,"replayed":false,"heartbeat":100000,"maxDuration":null${extra}}\n\n`

let bridge: Bridge | null = null
beforeEach(() => window.history.replaceState(null, '', '/customers'))
afterEach(() => {
  bridge?.destroy()
  bridge = null
})

describe('StreamClient', () => {
  it('connects with fetch, reports state and dispatches application events', async () => {
    const sse = sseFetch()
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const stream = bridge.stream('/events', {
      fetch: sse.fetch,
      channels: ['extra'],
      autoConnect: false,
    })
    const states: string[] = []
    stream.on('state', (s) => states.push(s))
    void stream.connect()
    const received: unknown[] = []
    stream.on('customer.created', (d) => received.push(d))
    const all: unknown[] = []
    stream.on('*', (e) => all.push(e))

    await tick()
    expect(header(sse.requests[0]!, 'Accept')).toBe('text/event-stream')
    expect((sse.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]).toContain(
      'channels=extra',
    )
    sse.send(ready())
    sse.send('id: 7\nevent: customer.created\ndata: {"id":12}\n\n')
    await tick()

    expect(stream.state).toBe('open')
    expect(states).toEqual(['connecting', 'open'])
    expect(received).toEqual([{ id: 12 }])
    expect(all).toHaveLength(2)
    stream.close()
    expect(stream.state).toBe('closed')
  })

  it('applies invalidate, prop and navigate control events to the page', async () => {
    const sse = sseFetch()
    const pageFetch = mockFetch(() => pageResponse(page({ props: { customers: [{ id: 2 }] } })))
    bridge = bridgeWith(pageFetch)
    const stream = bridge.stream('/events', { fetch: sse.fetch })
    await tick()
    sse.send(ready())
    sse.send('event: bridge\ndata: {"type":"prop","key":"filters.search","value":"x"}\n\n')
    await tick()
    expect((bridge.store.page?.props as Record<string, unknown>).filters).toEqual({ search: 'x' })

    sse.send('event: bridge\ndata: {"type":"invalidate","keys":["customers","missing"]}\n\n')
    await tick()
    await tick()
    expect(header(pageFetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('customers')
    expect((bridge.store.page?.props as Record<string, unknown>).customers).toEqual([{ id: 2 }])

    sse.send('event: bridge\ndata: {"type":"navigate","url":"http://evil.example/x"}\n\n')
    await tick()
    expect(pageFetch).toHaveBeenCalledTimes(1)
    stream.close()
  })

  it('reconnects with Last-Event-ID after an orderly end and resyncs when not replayed', async () => {
    const sse = sseFetch()
    const pageFetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(pageFetch)
    const stream = bridge.stream('/events', {
      fetch: sse.fetch,
      backoff: { initial: 1, max: 1, jitter: 0 },
    })
    const opens: unknown[] = []
    stream.on('open', (o) => opens.push(o))
    await tick()
    sse.send(ready())
    sse.send(
      'id: 42\nevent: bridge\ndata: {"type":"notification","level":"info","message":"hi"}\n\n',
    )
    sse.send('event: bridge\ndata: {"type":"end","reason":"max_duration","reconnect":true}\n\n')
    sse.close()
    await tick()
    await tick()

    expect(sse.requests).toHaveLength(2)
    expect(header(sse.requests[1]!, 'Last-Event-ID')).toBe('42')
    expect(stream.reconnectAttempts).toBe(1)
    sse.send(ready())
    await tick()
    await tick()
    expect(opens[1]).toEqual({ replayed: false, reconnect: true })
    // The server could not replay from 42, so events may be missing: resync (spec §6.4).
    expect(pageFetch).toHaveBeenCalledTimes(1)
    stream.close()
  })

  it('skips the resync after an orderly end when there was no id to replay from', async () => {
    const sse = sseFetch()
    const pageFetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(pageFetch)
    const stream = bridge.stream('/events', {
      fetch: sse.fetch,
      backoff: { initial: 1, max: 1, jitter: 0 },
    })
    await tick()
    sse.send(ready())
    sse.send('event: bridge\ndata: {"type":"end","reason":"max_duration","reconnect":true}\n\n')
    sse.close()
    await tick()
    await tick()

    expect(sse.requests).toHaveLength(2)
    expect(header(sse.requests[1]!, 'Last-Event-ID')).toBeUndefined()
    sse.send(ready())
    await tick()
    await tick()
    expect(pageFetch).toHaveBeenCalledTimes(0)
    stream.close()
  })

  it('takes the cursor from an end frame and does not resync when replayed', async () => {
    const sse = sseFetch()
    const pageFetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(pageFetch)
    const stream = bridge.stream('/events', {
      fetch: sse.fetch,
      backoff: { initial: 1, max: 1, jitter: 0 },
    })
    await tick()
    sse.send(ready())
    sse.send(
      'id: 77\nevent: bridge\ndata: {"type":"end","reason":"max_duration","reconnect":true}\n\n',
    )
    sse.close()
    await tick()
    await tick()

    expect(header(sse.requests[1]!, 'Last-Event-ID')).toBe('77')
    sse.send(ready().replace('"replayed":false', '"replayed":true'))
    await tick()
    await tick()
    expect(pageFetch).toHaveBeenCalledTimes(0)
    stream.close()
  })

  it('resyncs after a dropped connection when the server could not replay', async () => {
    const sse = sseFetch()
    const pageFetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(pageFetch)
    const stream = bridge.stream('/events', {
      fetch: sse.fetch,
      backoff: { initial: 1, max: 1, jitter: 0 },
    })
    await tick()
    sse.send(ready())
    sse.close() // dropped without an end event
    await tick()
    await tick()
    expect(sse.requests).toHaveLength(2)
    sse.send(ready())
    await tick()
    await tick()
    expect(pageFetch).toHaveBeenCalledTimes(1)
    stream.close()
  })

  it('stops after a final error and after 401/403 responses', async () => {
    const sse = sseFetch()
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const stream = bridge.stream('/events', {
      fetch: sse.fetch,
      backoff: { initial: 1, jitter: 0 },
    })
    const errors: unknown[] = []
    stream.on('error', (e) => errors.push(e))
    await tick()
    sse.send(ready())
    sse.send(
      'event: bridge\ndata: {"type":"error","status":403,"kind":"forbidden","message":"no","final":true}\n\n',
    )
    sse.close()
    await tick()
    await tick()
    expect(stream.state).toBe('closed')
    expect(errors).toHaveLength(1)
    expect(sse.requests).toHaveLength(1)

    const refused = vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch
    const s2 = bridge.stream('/events', { fetch: refused })
    await tick()
    expect(s2.state).toBe('closed')
  })

  it('retries with backoff when the connection drops without an end event', async () => {
    const sse = sseFetch()
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const stream = bridge.stream('/events', {
      fetch: sse.fetch,
      backoff: { initial: 1, max: 1, jitter: 0 },
    })
    await tick()
    sse.send(ready())
    sse.close()
    await tick()
    await tick()
    expect(stream.state).toMatch(/reconnecting|open/)
    expect(sse.requests.length).toBeGreaterThanOrEqual(2)
    stream.close()
  })

  it('emits heartbeats for comment lines and honours the watchdog', async () => {
    vi.useFakeTimers()
    try {
      const sse = sseFetch()
      bridge = bridgeWith(mockFetch(() => pageResponse(page())))
      const stream = bridge.stream('/events', {
        fetch: sse.fetch,
        heartbeatTimeout: 1,
        backoff: { initial: 1, jitter: 0 },
      })
      const beats: number[] = []
      stream.on('heartbeat', (t) => beats.push(t))
      await vi.advanceTimersByTimeAsync(5)
      sse.send(
        'retry: 10\nevent: bridge\ndata: {"type":"ready","protocol":1,"replayed":false,"heartbeat":1000,"maxDuration":null}\n\n',
      )
      sse.send(': hb\n\n')
      await vi.advanceTimersByTimeAsync(5)
      expect(beats).toHaveLength(1)
      expect(stream.lastEventAt).not.toBeNull()

      await vi.advanceTimersByTimeAsync(1500)
      expect(sse.requests.length).toBeGreaterThanOrEqual(2)
      stream.close()
    } finally {
      vi.useRealTimers()
    }
  })
})
