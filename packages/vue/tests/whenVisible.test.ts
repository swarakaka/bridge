import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createBridgeApp, useWhenVisible, WhenVisible } from '../src/index.js'
import type { BridgeApp } from '../src/index.js'
import { embed, flush, mockFetch, page, pageResponse } from './helpers.js'

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
  fire(visible: boolean): void {
    this.callback(
      this.elements.map(
        (target) => ({ isIntersecting: visible, target }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    )
  }
}

let app: BridgeApp | null = null
/** Past the router's 50 ms reload debounce. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 80))

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

const Show = defineComponent({
  setup() {
    return () =>
      h('div', [
        h(
          WhenVisible,
          { data: 'activity', buffer: 200, as: 'section', id: 'activity' },
          {
            default: ({ loading }: { loading: boolean }) =>
              h('p', { id: 'ready' }, `ready ${String(loading)}`),
            fallback: () => h('p', { id: 'fallback' }, 'loading…'),
          },
        ),
      ])
  },
})

describe('<WhenVisible>', () => {
  it('shows the fallback until visible, then loads the keys in one partial reload', async () => {
    const requests: Array<string | null> = []
    embed(page({ component: 'Show', props: {} }))
    app = await createBridgeApp({
      resolve: () => Show,
      fetch: mockFetch((_, init) => {
        requests.push((init.headers as Record<string, string>)['X-Bridge-Only'] ?? null)
        return pageResponse(page({ component: 'Show', props: { activity: ['signed in'] } }))
      }),
    })
    await flush()

    const section = document.getElementById('activity')!
    expect(section.tagName).toBe('SECTION')
    expect(document.getElementById('fallback')).not.toBeNull()
    expect(FakeObserver.instances[0]!.options.rootMargin).toBe('200px')
    expect(requests).toEqual([])

    FakeObserver.instances[0]!.fire(true)
    await settle()

    expect(requests).toEqual(['activity'])
    expect(document.getElementById('ready')!.textContent).toBe('ready false')
    expect(FakeObserver.instances[0]!.disconnected).toBe(true)
  })

  it('renders the content without a request when the keys are present', async () => {
    const fetch = mockFetch(() => pageResponse(page()))
    embed(page({ component: 'Show', props: { activity: [] } }))
    app = await createBridgeApp({ resolve: () => Show, fetch })
    await flush()

    expect(document.getElementById('ready')).not.toBeNull()
    expect(FakeObserver.instances).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops observing when unmounted', async () => {
    embed(page({ component: 'Show', props: {} }))
    app = await createBridgeApp({
      resolve: () => Show,
      fetch: mockFetch(() => pageResponse(page())),
    })
    await flush()
    app.app!.unmount()
    expect(FakeObserver.instances[0]!.disconnected).toBe(true)
    app.bridge.destroy()
    app = null
  })
})

describe('useWhenVisible', () => {
  it('reports visibility and loading for custom markup', async () => {
    let release: () => void = () => undefined
    const Custom = defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null)
        const { visible, loading } = useWhenVisible(target, ['comments'])
        return () =>
          h(
            'div',
            { ref: target, id: 'custom' },
            `${String(visible.value)} ${String(loading.value)}`,
          )
      },
    })
    embed(page({ component: 'Custom', props: {} }))
    app = await createBridgeApp({
      resolve: () => Custom,
      fetch: mockFetch(
        () =>
          new Promise<Response>((resolve) => {
            release = () =>
              resolve(pageResponse(page({ component: 'Custom', props: { comments: [] } })))
          }),
      ),
    })
    await flush()
    const text = () => document.getElementById('custom')!.textContent

    expect(text()).toBe('false false')
    FakeObserver.instances[0]!.fire(true)
    await flush()
    expect(text()).toBe('true true')

    await settle()
    release()
    await flush()
    expect(text()).toBe('true false')
    FakeObserver.instances[0]!.fire(false)
    await flush()
    expect(text()).toBe('false false')
  })
})
