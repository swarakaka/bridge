import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadWhenVisible, type Bridge } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse, tick } from './helpers.js'

class FakeObserver {
  static instances: FakeObserver[] = []
  readonly elements: Element[] = []
  disconnected = false
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeObserver.instances.push(this)
  }
  observe(element: Element): void {
    this.elements.push(element)
  }
  disconnect(): void {
    this.disconnected = true
  }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  /** What the browser reports when the element enters or leaves the viewport. */
  fire(visible: boolean): void {
    const entries = this.elements.map(
      (target) => ({ isIntersecting: visible, target }) as IntersectionObserverEntry,
    )
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

let bridge: Bridge | null = null
const element = (): HTMLElement => document.body.appendChild(document.createElement('div'))

beforeEach(() => {
  window.history.replaceState(null, '', '/customers')
  FakeObserver.instances = []
  Object.defineProperty(window, 'IntersectionObserver', {
    value: FakeObserver,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  bridge?.destroy()
  bridge = null
  delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
  document.body.innerHTML = ''
})

describe('loadWhenVisible', () => {
  it('loads the keys once the element becomes visible, then stops observing', async () => {
    const fetch = mockFetch(() => pageResponse(page({ props: { activity: [1] } })))
    bridge = bridgeWith(fetch)
    loadWhenVisible(bridge, element(), { keys: ['activity'], buffer: 200 })
    const observer = FakeObserver.instances[0]!
    expect(observer.options.rootMargin).toBe('200px')

    observer.fire(false)
    await tick()
    expect(fetch).not.toHaveBeenCalled()

    observer.fire(true)
    expect(bridge.store.current.loading.has('activity')).toBe(true)
    await tick()

    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('activity')
    expect(bridge.store.page?.props).toMatchObject({ activity: [1] })
    expect(bridge.store.current.loading.has('activity')).toBe(false)
    expect(observer.disconnected).toBe(true)
  })

  it('coalesces widgets that become visible together into one request', async () => {
    const fetch = mockFetch(() => pageResponse(page({ props: { a: 1, b: 2 } })))
    bridge = bridgeWith(fetch, { reloadDebounce: 10 })
    loadWhenVisible(bridge, element(), { keys: ['a'] })
    loadWhenVisible(bridge, element(), { keys: ['b'] })
    FakeObserver.instances.forEach((o) => o.fire(true))
    await new Promise((r) => setTimeout(r, 30))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('a,b')
  })

  it('does nothing when the keys are already on the page', async () => {
    const fetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(fetch)
    loadWhenVisible(bridge, element(), { keys: ['customers'] })
    expect(FakeObserver.instances).toHaveLength(0)
    await tick()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps observing for visibility when asked, without loading again', async () => {
    const fetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(fetch)
    const seen: boolean[] = []
    loadWhenVisible(bridge, element(), {
      keys: ['customers'],
      onVisibilityChange: (v) => seen.push(v),
    })
    FakeObserver.instances[0]!.fire(true)
    FakeObserver.instances[0]!.fire(false)
    await tick()
    expect(seen).toEqual([true, false])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reloads on every entry with always, skipping entries while a load runs', async () => {
    let n = 0
    const fetch = mockFetch(() => pageResponse(page({ props: { feed: ++n } })))
    bridge = bridgeWith(fetch)
    loadWhenVisible(bridge, element(), { keys: ['customers'], always: true })
    const observer = FakeObserver.instances[0]!

    observer.fire(true)
    observer.fire(true)
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)

    observer.fire(false)
    observer.fire(true)
    await tick()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(observer.disconnected).toBe(false)
  })

  it('loads at once without IntersectionObserver', async () => {
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
    const fetch = mockFetch(() => pageResponse(page({ props: { activity: [] } })))
    bridge = bridgeWith(fetch)
    loadWhenVisible(bridge, element(), { keys: ['activity'] })
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('clears loading when the page changed before the load ran', async () => {
    const fetch = mockFetch((url) =>
      pageResponse(
        url.endsWith('/other') ? page({ component: 'Other', url: '/other' }) : page({ props: {} }),
      ),
    )
    bridge = bridgeWith(fetch, { reloadDebounce: 10 })
    loadWhenVisible(bridge, element(), { keys: ['activity'] })
    FakeObserver.instances[0]!.fire(true)
    await bridge.router.visit('/other')
    await new Promise((r) => setTimeout(r, 30))

    expect(fetch.calls().map((c) => new URL(c.url).pathname)).toEqual(['/other'])
    expect(bridge.store.current.loading.has('activity')).toBe(false)
  })

  it('stop() ends observation', async () => {
    const fetch = mockFetch(() => pageResponse(page({ props: { activity: [] } })))
    bridge = bridgeWith(fetch)
    const handle = loadWhenVisible(bridge, element(), { keys: ['activity'] })
    handle.stop()
    expect(FakeObserver.instances[0]!.disconnected).toBe(true)
    FakeObserver.instances[0]!.fire(true)
    await tick()
    expect(fetch).not.toHaveBeenCalled()
  })
})
