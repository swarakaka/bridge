import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestManager } from '../src/index.js'
import type { Bridge } from '../src/index.js'
import { bridgeWith, mockFetch, page, pageResponse, tick } from './helpers.js'

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
})
