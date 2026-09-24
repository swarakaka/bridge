import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BridgePage } from '@swarakaka/bridge-core'
import { defineComponent, h } from 'vue'
import { createBridgeApp, InfiniteScroll } from '../src/index.js'
import type { BridgeApp } from '../src/index.js'
import { embed, flush, mockFetch, page, pageResponse } from './helpers.js'

class FakeObserver {
  static instances: FakeObserver[] = []
  readonly elements: Element[] = []
  disconnected = false
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this)
  }
  observe(element: Element): void {
    this.elements.push(element)
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  fire(edge: 'before' | 'after'): void {
    const target = document.querySelector(`[data-bridge-scroll-edge="${edge}"]`)!
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

function listPage(n: number): BridgePage {
  return page({
    component: 'List',
    url: n === 1 ? '/customers' : `/customers?page=${n}`,
    props: { customers: { data: [{ id: 10 - n, name: `C${10 - n}` }] } },
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
  })
}

const List = defineComponent({
  props: { customers: { type: Object, required: true } },
  setup(props) {
    return () =>
      h(
        InfiniteScroll,
        { data: 'customers', as: 'section' },
        {
          default: () =>
            h(
              'ul',
              (props.customers as { data: Array<{ id: number; name: string }> }).data.map((c) =>
                h('li', { key: c.id }, c.name),
              ),
            ),
          loading: ({ direction }: { direction: string }) =>
            h('p', { id: 'loading' }, `loading ${direction}`),
        },
      )
  },
})

let app: BridgeApp | null = null
const names = () => Array.from(document.querySelectorAll('li')).map((li) => li.textContent)

beforeEach(() => {
  FakeObserver.instances = []
  Object.defineProperty(window, 'IntersectionObserver', {
    value: FakeObserver,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
  document.body.innerHTML = ''
})

async function mount(
  start = 2,
  fetch = mockFetch((url) =>
    pageResponse(listPage(Number(new URL(url).searchParams.get('page') ?? 1))),
  ),
) {
  window.history.replaceState(null, '', start === 1 ? '/customers' : `/customers?page=${start}`)
  embed(listPage(start))
  app = await createBridgeApp({ resolve: () => List, fetch })
  await flush()
  return fetch
}

describe('<InfiniteScroll>', () => {
  it('loads the next page at the bottom edge and the previous one at the top', async () => {
    await mount()
    expect(names()).toEqual(['C8'])
    // Observing: no manual buttons.
    expect(document.querySelector('[data-bridge-scroll="next"]')).toBeNull()

    FakeObserver.instances[0]!.fire('after')
    await flush()
    await flush()
    expect(names()).toEqual(['C8', 'C7'])
    expect(document.querySelector('[role="status"]')!.textContent).toBe('Loaded page 3')

    FakeObserver.instances[0]!.fire('before')
    await flush()
    await flush()
    expect(names()).toEqual(['C9', 'C8', 'C7'])
    expect(window.location.search).toBe('')
  })

  it('shows the loading slot at the end being loaded', async () => {
    let release: () => void = () => undefined
    await mount(
      2,
      mockFetch(
        () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(pageResponse(listPage(3)))
          }),
      ),
    )
    FakeObserver.instances[0]!.fire('after')
    await flush()
    expect(document.getElementById('loading')!.textContent).toBe('loading next')
    release()
    await flush()
    await flush()
    expect(document.getElementById('loading')).toBeNull()
  })

  it('renders load buttons without IntersectionObserver', async () => {
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
    await mount()
    const next = document.querySelector<HTMLButtonElement>('[data-bridge-scroll="next"]')!
    expect(next.textContent).toBe('Load more')
    expect(document.querySelector('[data-bridge-scroll="previous"]')!.textContent).toBe(
      'Load previous',
    )
    next.click()
    await flush()
    await flush()
    expect(names()).toEqual(['C8', 'C7'])
    // The last page has no next control.
    expect(document.querySelector('[data-bridge-scroll="next"]')).toBeNull()
  })

  it('stops observing when unmounted', async () => {
    await mount()
    app!.app!.unmount()
    expect(FakeObserver.instances[0]!.disconnected).toBe(true)
    app!.bridge.destroy()
    app = null
  })
})
