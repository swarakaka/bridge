import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { InfiniteScroll, type Bridge, type InfiniteScrollOptions } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse, tick } from './helpers.js'

class FakeObserver {
  static instances: FakeObserver[] = []
  readonly elements = new Set<Element>()
  observed: Element[] = []
  disconnected = false
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeObserver.instances.push(this)
  }
  observe(element: Element): void {
    this.elements.add(element)
    this.observed.push(element)
  }
  unobserve(element: Element): void {
    this.elements.delete(element)
  }
  disconnect(): void {
    this.disconnected = true
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  fire(target: Element, visible = true): void {
    this.callback(
      [{ isIntersecting: visible, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

/** A paginated list of 3 pages × 2 items, ids descending like `latest('id')`. */
function listPage(n: number, extra: Partial<BridgePage> = {}): BridgePage {
  const ids = [7 - 2 * n, 6 - 2 * n]
  return page({
    component: 'Customers/Index',
    url: n === 1 ? '/customers' : `/customers?page=${n}`,
    props: { customers: { data: ids.map((id) => ({ id })), meta: { current_page: n } } },
    meta: {
      merge: ['customers'],
      matchOn: { customers: ['data.id'] },
      scroll: {
        customers: {
          pageName: 'page',
          dataPath: 'data',
          currentPage: n,
          previousPage: n > 1 ? n - 1 : null,
          nextPage: n < 3 ? n + 1 : null,
        },
      },
    },
    ...extra,
  })
}

const server = () =>
  mockFetch((url) => pageResponse(listPage(Number(new URL(url).searchParams.get('page') ?? 1))))

const ids = (bridge: Bridge): number[] =>
  (
    (bridge.store.page?.props as { customers: { data: Array<{ id: number }> } }).customers.data ??
    []
  ).map((c) => c.id)

let bridge: Bridge | null = null
let scroll: InfiniteScroll | null = null
const before = document.createElement('div')
const after = document.createElement('div')

function create(options: Partial<InfiniteScrollOptions> = {}): InfiniteScroll {
  scroll = new InfiniteScroll(bridge!, window, {
    prop: 'customers',
    afterRender: () => Promise.resolve(),
    ...options,
  })
  return scroll
}

beforeEach(() => {
  window.history.replaceState(null, '', '/customers?page=2')
  FakeObserver.instances = []
  Object.defineProperty(window, 'IntersectionObserver', {
    value: FakeObserver,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  scroll?.stop()
  scroll = null
  bridge?.destroy()
  bridge = null
  delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
  vi.restoreAllMocks()
})

describe('InfiniteScroll', () => {
  it('starts from meta.scroll, manual until it observes', () => {
    bridge = bridgeWith(server(), { initialPage: listPage(2) })
    const s = create()
    expect(s.state).toMatchObject({
      hasNext: true,
      hasPrevious: true,
      loadingNext: false,
      manualNext: true,
    })
    s.start(before, after)
    expect(s.state.manualNext).toBe(false)
    expect(FakeObserver.instances[0]!.options.rootMargin).toBe('500px')
  })

  it('loads the next page at the bottom edge, appends it and moves only the next end', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const s = create()
    s.start(before, after)

    FakeObserver.instances[0]!.fire(after)
    expect(s.state.loadingNext).toBe(true)
    await tick()

    const call = fetch.calls()[0]!
    expect(new URL(call.url).search).toBe('?page=3')
    expect(header(call.init, 'X-Bridge-Only')).toBe('customers')
    expect(ids(bridge)).toEqual([3, 2, 1, 0])
    expect(s.state).toMatchObject({ hasNext: false, hasPrevious: true, loadingNext: false })
    expect(s.state.announcement).toBe('Loaded page 3')
    // The address follows the page just loaded.
    expect(window.location.search).toBe('?page=3')
    // The edge is observed again in case it is still in view.
    expect(FakeObserver.instances[0]!.observed.filter((e) => e === after)).toHaveLength(2)
  })

  it('prepends the previous page at the top edge and keeps the viewport still', async () => {
    bridge = bridgeWith(server(), { initialPage: listPage(2) })
    let height = 1000
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => height)
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
    const s = create({
      afterRender: async () => {
        height = 1400
      },
    })
    s.start(before, after)

    FakeObserver.instances[0]!.fire(before)
    await tick()

    expect(ids(bridge)).toEqual([5, 4, 3, 2])
    expect(s.state).toMatchObject({ hasPrevious: false, hasNext: true })
    expect(scrollBy).toHaveBeenCalledWith(0, 400)
  })

  it('keeps meta.scroll and loading after a partial response for another prop', async () => {
    const fetch = mockFetch((url, init) =>
      pageResponse(
        header(init, 'X-Bridge-Only') === 'stats'
          ? page({
              component: 'Customers/Index',
              url: '/customers?page=2',
              props: { stats: 1 },
              // Any meta at all (here what encrypted routes add) replaces the page's meta.
              meta: { encryptHistory: false },
            })
          : listPage(Number(new URL(url).searchParams.get('page') ?? 1)),
      ),
    )
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const s = create()
    s.start(before, after)
    // A deferred group or another reload: its page does not mention the scroll prop.
    await bridge.router.reload({ only: ['stats'] })
    expect(bridge.store.page?.meta?.scroll?.customers?.nextPage).toBe(3)
    expect(bridge.store.page?.meta?.encryptHistory).toBe(false)

    FakeObserver.instances[0]!.fire(after)
    await tick()
    expect(ids(bridge)).toEqual([3, 2, 1, 0])
  })

  it('runs one load at a time', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const s = create()
    s.start(before, after)
    FakeObserver.instances[0]!.fire(after)
    FakeObserver.instances[0]!.fire(before)
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not observe in manual mode, and loads on demand', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const s = create({ manual: true })
    s.start(before, after)
    expect(FakeObserver.instances).toHaveLength(0)
    expect(s.state.manualNext).toBe(true)
    await s.loadNext()
    expect(ids(bridge)).toEqual([3, 2, 1, 0])
  })

  it('switches to manual after manualAfter automatic loads', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage(1) })
    window.history.replaceState(null, '', '/customers')
    const s = create({ manualAfter: 1 })
    s.start(before, after)
    FakeObserver.instances[0]!.fire(after)
    await tick()
    expect(s.state.manualNext).toBe(true)
    FakeObserver.instances[0]!.fire(after)
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the address with preserveUrl', async () => {
    bridge = bridgeWith(server(), { initialPage: listPage(2) })
    const s = create({ preserveUrl: true })
    s.start(before, after)
    FakeObserver.instances[0]!.fire(after)
    await tick()
    expect(window.location.search).toBe('?page=2')
    expect(ids(bridge)).toEqual([3, 2, 1, 0])
  })

  it('starts over when another visit replaces the prop', async () => {
    const fetch = mockFetch((url) =>
      pageResponse(new URL(url).searchParams.get('search') ? listPage(1) : listPage(3)),
    )
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const s = create()
    s.start(before, after)
    await s.loadNext()
    expect(s.state.hasNext).toBe(false)

    await bridge.router.get(
      '/customers',
      { search: 'a' },
      { only: ['customers'], preserveState: true },
    )
    expect(s.state).toMatchObject({ hasPrevious: false, hasNext: true })
    expect(ids(bridge)).toEqual([5, 4])
  })

  it('continues from the ends kept in history', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const first = create()
    first.start(before, after)
    await first.loadNext()
    first.stop()

    // A new controller for the same list (remounted, or restored from history).
    const second = create()
    await second.loadPrevious()
    expect(new URL(fetch.calls().at(-1)!.url).search).toBe('?page=1')
  })

  it('loads the next page at the top edge in reverse mode, keeping the viewport still', async () => {
    bridge = bridgeWith(server(), { initialPage: listPage(2) })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
    const s = create({ reverse: true })
    s.start(before, after)
    FakeObserver.instances[0]!.fire(before)
    await tick()
    expect(ids(bridge)).toEqual([3, 2, 1, 0])
    expect(scrollBy).toHaveBeenCalled()
  })

  it('passes cursor strings and announces without a page number', async () => {
    const fetch = mockFetch(() =>
      pageResponse(
        page({
          component: 'Feed',
          url: '/feed?cursor=b',
          props: { items: [{ id: 2 }] },
          meta: {
            merge: ['items'],
            scroll: {
              items: {
                pageName: 'cursor',
                dataPath: 'data',
                currentPage: 'b',
                previousPage: 'a',
                nextPage: null,
              },
            },
          },
        }),
      ),
    )
    bridge = bridgeWith(fetch, {
      initialPage: page({
        component: 'Feed',
        url: '/feed',
        props: { items: [{ id: 1 }] },
        meta: {
          merge: ['items'],
          scroll: {
            items: {
              pageName: 'cursor',
              dataPath: 'data',
              currentPage: null,
              previousPage: null,
              nextPage: 'b',
            },
          },
        },
      }),
    })
    const s = create({ prop: 'items' })
    await s.loadNext()
    expect(new URL(fetch.calls()[0]!.url).searchParams.get('cursor')).toBe('b')
    expect(s.state).toMatchObject({ hasNext: false, announcement: 'Loaded more items' })
  })

  it('re-fetches every loaded page on an invalidation instead of dropping to one', async () => {
    let version = 1
    const fetch = mockFetch((url, init) => {
      if (header(init, 'X-Bridge-Only') === 'stats')
        return pageResponse(
          page({
            component: 'Customers/Index',
            url: new URL(url).pathname + new URL(url).search,
            props: { stats: version },
          }),
        )
      const n = Number(new URL(url).searchParams.get('page') ?? 1)
      const fresh = listPage(n)
      const data = (fresh.props as { customers: { data: Array<{ id: number }> } }).customers.data
      data.forEach((item) => Object.assign(item, { v: version }))
      return pageResponse(fresh)
    })
    const initial = listPage(2)
    Object.assign(initial.props, { stats: 1 })
    bridge = bridgeWith(fetch, { initialPage: initial })
    const s = create()
    s.start(before, after)
    await s.loadNext()
    expect(ids(bridge)).toEqual([3, 2, 1, 0])

    version = 2
    const calls = fetch.calls().length
    await bridge.router.invalidate(['customers', 'stats'])
    await tick()

    const refreshed = fetch.calls().slice(calls)
    expect(refreshed.map((c) => header(c.init, 'X-Bridge-Only'))).toEqual(
      expect.arrayContaining(['customers', 'customers', 'stats']),
    )
    expect(
      refreshed
        .filter((c) => header(c.init, 'X-Bridge-Only') === 'customers')
        .map((c) => new URL(c.url).search),
    ).toEqual(['?page=2', '?page=3'])
    const customers = (
      bridge.store.page?.props as {
        customers: { data: Array<{ id: number; v: number }> }
      }
    ).customers.data
    expect(customers.map((c) => [c.id, c.v])).toEqual([
      [3, 2],
      [2, 2],
      [1, 2],
      [0, 2],
    ])
    expect(s.state).toMatchObject({ hasPrevious: true, hasNext: false })
    expect(window.location.search).toBe('?page=3')
  })

  it('refreshes with invalidate("*") and reloads the other props without it', async () => {
    // The server honours X-Bridge-Except: the '*' reload does not send the list.
    const fetch = mockFetch((url, init) => {
      const n = Number(new URL(url).searchParams.get('page') ?? 1)
      const response = listPage(n)
      if (header(init, 'X-Bridge-Except') === 'customers') response.props = {}
      return pageResponse(response)
    })
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const s = create()
    s.start(before, after)
    await s.loadNext()
    const calls = fetch.calls().length

    await bridge.router.invalidate('*')
    await tick()

    const later = fetch.calls().slice(calls)
    expect(later.filter((c) => header(c.init, 'X-Bridge-Except') === 'customers')).toHaveLength(1)
    expect(later.filter((c) => header(c.init, 'X-Bridge-Only') === 'customers')).toHaveLength(2)
    expect(ids(bridge)).toEqual([3, 2, 1, 0])
  })

  it('reloads the prop normally once the list is gone', async () => {
    const fetch = server()
    bridge = bridgeWith(fetch, { initialPage: listPage(2) })
    const s = create()
    s.start(before, after)
    await s.loadNext()
    s.stop()

    await bridge.router.invalidate(['customers'])
    expect(header(fetch.calls().at(-1)!.init, 'X-Bridge-Only')).toBe('customers')
    expect(ids(bridge)).toEqual([1, 0])
  })

  it('stays manual without IntersectionObserver', () => {
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
    bridge = bridgeWith(server(), { initialPage: listPage(2) })
    const s = create()
    s.start(before, after)
    expect(s.state.manualNext).toBe(true)
  })
})
