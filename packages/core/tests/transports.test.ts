import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestManager } from '../src/index.js'
import type { Bridge } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse, tick } from './helpers.js'

/** Minimal XMLHttpRequest double: records the request and lets the test drive progress and completion. */
class FakeXhr {
  static instances: FakeXhr[] = []
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = null
  status = 200
  responseText = ''
  responseURL = ''
  withCredentials = false
  upload = {
    listeners: new Map<string, (e: unknown) => void>(),
    addEventListener: (n: string, l: (e: unknown) => void) =>
      void FakeXhr.instances.at(-1)!.upload.listeners.set(n, l),
  }
  private listeners = new Map<string, () => void>()
  constructor() {
    FakeXhr.instances.push(this)
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener)
  }
  getAllResponseHeaders() {
    return 'Content-Type: application/vnd.bridge+json; v=1\r\nX-Test: 1\r\n'
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {}
  progress(loaded: number, total: number) {
    this.upload.listeners.get('progress')?.({ lengthComputable: true, loaded, total })
  }
  finish(text: string, status = 200, url = 'http://localhost/customers/1') {
    this.status = status
    this.responseText = text
    this.responseURL = url
    this.listeners.get('load')?.()
  }
  fail() {
    this.listeners.get('error')?.()
  }
}

describe('RequestManager XHR uploads', () => {
  const original = globalThis.XMLHttpRequest
  beforeEach(() => {
    FakeXhr.instances = []
    ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr
  })
  afterEach(() => {
    ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = original
  })

  it('uses XHR for multipart bodies with progress and parses the response', async () => {
    const manager = new RequestManager({ xsrfCookie: () => 't' })
    const progress = vi.fn()
    const promise = manager.send({
      method: 'put',
      url: '/customers/1',
      data: { avatar: new File(['x'], 'a.png') },
      onProgress: progress,
    })
    await tick()
    const xhr = FakeXhr.instances[0]!
    expect(xhr.method).toBe('POST')
    expect(xhr.headers['X-XSRF-TOKEN']).toBe('t')
    expect((xhr.body as FormData).get('_method')).toBe('PUT')
    xhr.progress(50, 100)
    expect(progress).toHaveBeenCalledWith({ loaded: 50, total: 100, percentage: 50 })
    xhr.finish('{"ok":true}')
    const response = await promise
    expect(response.status).toBe(200)
    expect(response.headers.get('x-test')).toBe('1')
    expect(response.url).toBe('http://localhost/customers/1')
    expect(await response.text()).toBe('{"ok":true}')
  })

  it('rejects on network errors and aborts through the signal', async () => {
    const manager = new RequestManager({ xsrfCookie: () => null })
    const failing = manager.send({
      method: 'post',
      url: '/x',
      data: { f: new File(['x'], 'f') },
      onProgress: () => undefined,
    })
    await tick()
    FakeXhr.instances[0]!.fail()
    await expect(failing).rejects.toThrow('Network request failed')

    const controller = new AbortController()
    const aborted = manager.send({
      method: 'post',
      url: '/x',
      data: { f: new File(['x'], 'f') },
      onProgress: () => undefined,
      signal: controller.signal,
    })
    await tick()
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
  })
})

/** Minimal EventSource double. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  static CLOSED = 2
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  private listeners = new Map<string, (e: MessageEvent) => void>()
  constructor(
    public url: string,
    public init: { withCredentials: boolean },
  ) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(name: string, listener: (e: MessageEvent) => void) {
    this.listeners.set(name, listener)
  }
  close() {
    this.readyState = 2
  }
  emit(name: string, data: string, lastEventId = '') {
    this.listeners.get(name)?.({ data, lastEventId } as MessageEvent)
  }
}

describe('StreamClient EventSource transport', () => {
  const original = (globalThis as { EventSource?: unknown }).EventSource
  let bridge: Bridge | null = null
  beforeEach(() => {
    FakeEventSource.instances = []
    ;(globalThis as { EventSource: unknown }).EventSource = FakeEventSource
    window.history.replaceState(null, '', '/customers')
  })
  afterEach(() => {
    ;(globalThis as { EventSource: unknown }).EventSource = original
    bridge?.destroy()
  })

  it('opens a native EventSource, dispatches control and app events, and mirrors errors', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const stream = bridge.stream('/events', {
      transport: 'eventsource',
      withCredentials: true,
      backoff: { initial: 1, jitter: 0 },
    })
    stream.appEventNames.add('customer.created')
    const received: unknown[] = []
    stream.on('customer.created', (d) => received.push(d))
    const states: string[] = []
    stream.on('state', (s) => states.push(s))
    await tick()
    const source = FakeEventSource.instances[0]!
    expect(source.url).toContain('/events')
    expect(source.init.withCredentials).toBe(true)
    source.onopen?.()
    expect(stream.state).toBe('open')
    source.emit(
      'bridge',
      '{"type":"ready","protocol":1,"replayed":false,"heartbeat":1000,"maxDuration":null}',
    )
    source.emit('customer.created', '{"id":1}', '7')
    expect(received).toEqual([{ id: 1 }])
    source.onerror?.()
    expect(stream.state).toBe('reconnecting')
    source.readyState = 2
    source.onerror?.()
    stream.close()
    expect(stream.state).toBe('closed')
    expect(states).toContain('reconnecting')
  })

  it('resumes from the last id in the query after a refused connection with a transient status', async () => {
    const probe = mockFetch(() => new Response('{}', { status: 503 }))
    bridge = bridgeWith(probe)
    const stream = bridge.stream('/events', {
      transport: 'eventsource',
      backoff: { initial: 1, max: 1, jitter: 0 },
    })
    await tick()
    const first = FakeEventSource.instances[0]!
    expect(first.url).not.toContain('lastEventId')
    first.onopen?.()
    first.emit('bridge', '{"type":"invalidate","keys":["customers"]}', '41')
    first.readyState = 2
    first.onerror?.()
    await tick()
    await tick()

    expect(header(probe.calls()[0]!.init, 'Accept')).toBe('application/json')
    const second = FakeEventSource.instances[1]!
    expect(new URL(second.url).searchParams.get('lastEventId')).toBe('41')
    expect(stream.state).not.toBe('closed')
    stream.close()
  })

  it('stops reconnecting when the refused connection turns out to be a 401', async () => {
    bridge = bridgeWith(mockFetch(() => new Response('{}', { status: 401 })))
    const stream = bridge.stream('/events', {
      transport: 'eventsource',
      backoff: { initial: 1, max: 1, jitter: 0 },
    })
    const errors: unknown[] = []
    stream.on('error', (e) => errors.push(e))
    await tick()
    const source = FakeEventSource.instances[0]!
    source.readyState = 2
    source.onerror?.()
    await tick()
    await tick()

    expect(stream.state).toBe('closed')
    expect(errors).toContainEqual(expect.objectContaining({ type: 'transport', status: 401 }))
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('closes when the server ends without reconnect or sends a final error', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const ended = bridge.stream('/events', { transport: 'eventsource' })
    const failed = bridge.stream('/other', { transport: 'eventsource' })
    await tick()
    const [a, b] = FakeEventSource.instances
    a!.emit('bridge', '{"type":"end","reason":"closed","reconnect":false}')
    b!.emit(
      'bridge',
      '{"type":"error","status":403,"kind":"forbidden","message":"no","final":true}',
    )

    expect(ended.state).toBe('closed')
    expect(failed.state).toBe('closed')
    expect(a!.readyState).toBe(2)
    expect(b!.readyState).toBe(2)
  })
})
