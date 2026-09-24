import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createBridge, getBridge } from '@swarakaka/bridge-core'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import {
  BridgeHead,
  BridgeLink,
  createBridgeApp,
  useForm,
  useJson,
  useRemember,
  useStream,
} from '../src/index.js'
import type { BridgeApp, PageComponent } from '../src/index.js'
import { createSsrRenderer } from '../src/server/index.js'

function page(overrides: Partial<BridgePage> = {}): BridgePage {
  return {
    protocol: 1,
    type: 'page',
    component: 'Home',
    url: '/',
    props: {},
    build: 'b1',
    ...overrides,
  }
}
const pageResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.bridge+json; v=1' },
  })
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = await handler(url, init ?? {})
    Object.defineProperty(response, 'url', { value: url })
    return response
  }) as unknown as typeof fetch & { mock: { calls: Array<[unknown, RequestInit]> } }
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 15)))
const $ = (selector: string) => document.querySelector(selector)

let app: BridgeApp | null = null
afterEach(() => {
  app?.bridge.destroy()
  act(() => app?.root.unmount())
  app = null
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  document.title = ''
})

async function mount(
  components: Record<string, PageComponent>,
  initial: BridgePage,
  fetchImpl: typeof fetch = mockFetch(() => pageResponse(page())),
  html = '<div id="app"></div>',
) {
  window.history.replaceState(null, '', initial.url)
  document.body.innerHTML = `<script type="application/json" id="bridge-page">${JSON.stringify(initial)}</script>${html}`
  await act(async () => {
    app = await createBridgeApp({ resolve: (name) => components[name]!, fetch: fetchImpl })
  })
  return app!
}

describe('useStream', () => {
  it('renders idle first, connects after mount, delivers events and closes on unmount', async () => {
    const encoder = new TextEncoder()
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let aborted = false
    const sse = vi.fn(async (_input: unknown, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => (aborted = true))
      return new Response(new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) }), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }) as unknown as typeof fetch
    const renders: string[] = []
    const received: unknown[] = []
    const Live: PageComponent = () => {
      const stream = useStream('/events', { fetch: sse })
      renders.push(stream.state)
      useEffect(() => stream.on('customer.created', (d) => received.push(d)), [stream.on])
      return <span id="state">{stream.state}</span>
    }
    await mount({ Live }, page({ component: 'Live' }))
    await flush()

    expect(renders[0]).toBe('idle')
    expect(sse).toHaveBeenCalledTimes(1)
    await act(async () => {
      controller!.enqueue(encoder.encode('id: 1\nevent: customer.created\ndata: {"id":7}\n\n'))
    })
    await flush()
    expect($('#state')?.textContent).toBe('open')
    expect(received).toEqual([{ id: 7 }])

    act(() => app!.root.unmount())
    expect(aborted).toBe(true)
    app!.bridge.destroy()
    app = null
  })
})

describe('useJson', () => {
  it('shows processing, then the envelope data', async () => {
    let release: (r: Response) => void = () => undefined
    const http = mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const Json: PageComponent = () => {
      const json = useJson<{ total: number }>()
      return (
        <div>
          <button id="load" onClick={() => void json.get('/stats')} />
          <span id="processing">{String(json.processing)}</span>
          <span id="total">{json.data?.total ?? ''}</span>
        </div>
      )
    }
    await mount({ Json }, page({ component: 'Json' }), http)

    await act(async () => ($('#load') as HTMLButtonElement).click())
    expect($('#processing')?.textContent).toBe('true')
    await act(async () =>
      release(
        new Response('{"data":{"total":3}}', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await flush()
    expect($('#processing')?.textContent).toBe('false')
    expect($('#total')?.textContent).toBe('3')
  })
})

describe('remembered state', () => {
  it('restores useRemember and useForm({ remember }) on back navigation', async () => {
    const Create: PageComponent = () => {
      const [tab, setTab] = useRemember('tab', 'general')
      const form = useForm({ name: '' }, { remember: 'create' })
      return (
        <div>
          <span id="tab">{tab}</span>
          <span id="name">{form.data.name}</span>
          <button
            id="fill"
            onClick={() => {
              setTab('billing')
              form.setData('name', 'Initech')
            }}
          />
        </div>
      )
    }
    const Other: PageComponent = () => <div id="other" />
    const http = mockFetch(() => pageResponse(page({ component: 'Other', url: '/other' })))
    await mount({ Create, Other }, page({ component: 'Create', url: '/create' }), http)

    await act(async () => ($('#fill') as HTMLButtonElement).click())
    await flush()
    await act(async () => void (await app!.bridge.router.visit('/other')))
    await flush()
    expect($('#other')).not.toBeNull()

    await act(async () => window.history.back())
    await flush()
    await flush()
    expect($('#tab')?.textContent).toBe('billing')
    expect($('#name')?.textContent).toBe('Initech')
  })
})

describe('BridgeHead', () => {
  it('owns its meta tags, replaces server-rendered ones and restores the title', async () => {
    document.head.innerHTML = '<meta name="description" content="Old" data-bridge-head="ssr">'
    document.title = 'App'
    const WithHead: PageComponent = () => (
      <BridgeHead title="Customers" meta={[{ name: 'description', content: 'List' }]} />
    )
    const Plain: PageComponent = () => <div id="plain" />
    const http = mockFetch(() => pageResponse(page({ component: 'Plain', url: '/plain' })))
    await mount({ WithHead, Plain }, page({ component: 'WithHead' }), http)
    await flush()

    const metas = () => Array.from(document.head.querySelectorAll('meta[name="description"]'))
    expect(document.title).toBe('Customers')
    expect(metas().map((m) => m.getAttribute('content'))).toEqual(['List'])

    await act(async () => void (await app!.bridge.router.visit('/plain')))
    await flush()
    expect(metas()).toHaveLength(0)
    expect(document.title).toBe('App')
  })
})

describe('BridgeLink', () => {
  it('follows navigation with its active class, sends except/headers, passes attributes and leaves _blank alone', async () => {
    const http = mockFetch(() => pageResponse(page({ component: 'Home', url: '/customers' })))
    const success = vi.fn()
    const Home: PageComponent = () => (
      <nav>
        <BridgeLink
          id="list"
          href="/customers"
          activeClass="active"
          className="link"
          except={['stats']}
          headers={{ 'X-Custom': '1' }}
          data-testid="list-link"
          onSuccess={success}
        >
          Customers
        </BridgeLink>
        <BridgeLink id="blank" href="/customers" target="_blank">
          New tab
        </BridgeLink>
      </nav>
    )
    await mount({ Home }, page({ component: 'Home', url: '/' }), http)
    const link = $('#list') as HTMLAnchorElement

    expect(link.getAttribute('data-testid')).toBe('list-link')
    expect(link.className).toBe('link')

    const blank = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    await act(async () => void $('#blank')!.dispatchEvent(blank))
    expect(blank.defaultPrevented).toBe(false)

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })
    await flush()
    const headers = http.mock.calls.at(-1)![1].headers as Record<string, string>
    expect(headers['X-Bridge-Except']).toBe('stats')
    expect(headers['X-Custom']).toBe('1')
    expect(success).toHaveBeenCalledTimes(1)
    expect(($('#list') as HTMLElement).className).toBe('link active')
  })
})

describe('server rendering', () => {
  const Layout = ({ children }: { children: React.ReactElement }) => (
    <main id="layout">{children}</main>
  )
  const Index: PageComponent = (props) => (
    <div>
      <BridgeHead title="Customers · SSR" meta={[{ name: 'description', content: 'List' }]} />
      <h1>{String(props.title)}</h1>
    </div>
  )
  Index.layout = Layout

  it('renders the page with its layout and head, without touching the global instance', async () => {
    const own = createBridge({ initialPage: page(), window: undefined })
    const render = createSsrRenderer({ resolve: () => Index })

    const result = await render(page({ component: 'Index', props: { title: 'Customers' } }))

    expect(result.body).toContain('<main id="layout">')
    expect(result.body).toContain('<h1>Customers</h1>')
    expect(result.head).toEqual([
      '<title>Customers · SSR</title>',
      '<meta name="description" content="List" data-bridge-head="ssr">',
    ])
    expect(getBridge()).toBe(own)
    own.destroy()
  })

  it('hydrates the server markup without mismatches and marks the root afterwards', async () => {
    const initial = page({ component: 'Index', props: { title: 'Customers' } })
    const { body } = await createSsrRenderer({ resolve: () => Index })(initial)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await mount(
      { Index },
      initial,
      undefined,
      `<div id="app" data-server-rendered="true">${body}</div>`,
    )
    await flush()

    expect(errors).not.toHaveBeenCalled()
    expect($('#app')?.getAttribute('data-bridge-hydrated')).toBe('true')
    expect($('#layout h1')?.textContent).toBe('Customers')
    errors.mockRestore()
  })
})
