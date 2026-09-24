import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createContext, createElement, useContext } from 'react'
import {
  createBridgeApp,
  useForm,
  useProp,
  useDeferred,
  BridgeLink,
  Deferred,
} from '../src/index.js'
import type { BridgeApp, PageComponent } from '../src/index.js'
import type { BridgePage } from '@swarakaka/bridge-protocol'

function page(overrides: Partial<BridgePage> = {}): BridgePage {
  return {
    protocol: 1,
    type: 'page',
    component: 'Customers/Index',
    url: '/customers',
    props: { title: 'Customers', customers: [{ id: 1, name: 'Acme' }] },
    build: 'b1',
    ...overrides,
  }
}
function pageResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.bridge+json; v=1' },
  })
}
function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = handler(url, init ?? {})
    Object.defineProperty(response, 'url', { value: url })
    return response
  }) as unknown as typeof fetch
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 10)))

const Layout = ({ children }: { children: React.ReactElement }) => (
  <main id="layout">{children}</main>
)
const Index: PageComponent = (props) => {
  const title = useProp<string>('title')
  return (
    <div id="index">
      <h1>{title}</h1>
      <ul>
        {(props.customers as Array<{ id: number; name: string }>).map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
      <BridgeLink href="/customers/1">go</BridgeLink>
    </div>
  )
}
Index.layout = Layout
const Show: PageComponent = (props) => <div id="show">{String(props.id)}</div>
const Create: PageComponent = () => {
  const form = useForm({ name: '' })
  return (
    <form
      id="create"
      onSubmit={(e) => {
        e.preventDefault()
        void form.post('/customers')
      }}
    >
      <input
        id="name"
        value={form.data.name}
        onChange={(e) => form.setData('name', e.target.value)}
      />
      {form.errors.name ? <p id="error">{form.errors.name}</p> : null}
      <span id="processing">{String(form.processing)}</span>
    </form>
  )
}
const Dashboard: PageComponent = () => {
  const { loading } = useDeferred('stats')
  return (
    <div id="dash">
      <span id="loading">{String(loading)}</span>
      <Deferred data="stats" fallback={<span id="fallback">loading</span>}>
        <span id="stats">ready</span>
      </Deferred>
    </div>
  )
}
const components: Record<string, PageComponent> = {
  Dashboard,
  'Customers/Index': Index,
  'Customers/Show': Show,
  'Customers/Create': Create,
}

let app: BridgeApp | null = null
afterEach(() => {
  app?.bridge.destroy()
  app?.root.unmount()
  app = null
  document.body.innerHTML = ''
})

async function mount(fetchImpl: typeof fetch, initial = page()) {
  window.history.replaceState(null, '', initial.url)
  document.body.innerHTML = `<script type="application/json" id="bridge-page">${JSON.stringify(initial)}</script><div id="app"></div>`
  await act(async () => {
    app = await createBridgeApp({ resolve: (name) => components[name]!, fetch: fetchImpl })
  })
  return app!
}

describe('React adapter', () => {
  it('renders the embedded page with layout and navigates through links', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: { id: 1 } })),
    )
    await mount(fetch)
    expect(document.querySelector('#layout #index h1')?.textContent).toBe('Customers')
    expect(document.querySelectorAll('li')).toHaveLength(1)

    await act(async () => {
      document
        .querySelector('a')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })
    await flush()
    expect(document.querySelector('#show')?.textContent).toBe('1')
    expect(window.location.pathname).toBe('/customers/1')
  })

  it('binds forms and shows validation errors', async () => {
    const fetch = mockFetch(() =>
      pageResponse(
        {
          protocol: 1,
          type: 'error',
          error: {
            status: 422,
            kind: 'validation',
            message: 'x',
            errors: { name: ['Name is required.'] },
          },
        },
        422,
      ),
    )
    await mount(fetch, page({ component: 'Customers/Create', url: '/customers/create', props: {} }))
    await act(async () => {
      document
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()
    expect(document.querySelector('#error')?.textContent).toBe('Name is required.')
  })

  it('shows processing while a submit is in flight', async () => {
    let release: (r: Response) => void = () => undefined
    const fetch = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          release = (r) => {
            Object.defineProperty(r, 'url', { value: String(input) })
            resolve(r)
          }
        }),
    ) as unknown as typeof globalThis.fetch
    await mount(fetch, page({ component: 'Customers/Create', url: '/customers/create', props: {} }))
    const processing = () => document.querySelector('#processing')?.textContent

    await act(async () => {
      document
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(processing()).toBe('true')

    await act(async () =>
      release(
        pageResponse(page({ component: 'Customers/Show', url: '/customers/2', props: { id: 2 } })),
      ),
    )
    await flush()
    expect(document.querySelector('#show')?.textContent).toBe('2')
  })

  it('loads deferred props after the first render, showing the fallback meanwhile', async () => {
    let release: (r: Response) => void = () => undefined
    const fetch = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          release = (r) => {
            Object.defineProperty(r, 'url', { value: String(input) })
            resolve(r)
          }
        }),
    ) as unknown as typeof globalThis.fetch
    await mount(
      fetch,
      page({ component: 'Dashboard', url: '/', props: {}, deferred: { default: ['stats'] } }),
    )
    await flush()

    expect(document.querySelector('#fallback')).not.toBeNull()
    expect(document.querySelector('#loading')?.textContent).toBe('true')
    const headers = (fetch as unknown as { mock: { calls: Array<[unknown, RequestInit]> } }).mock
      .calls[0]![1].headers as Record<string, string>
    expect(headers['X-Bridge-Only']).toBe('stats')

    await act(async () =>
      release(pageResponse(page({ component: 'Dashboard', url: '/', props: { stats: { n: 1 } } }))),
    )
    await flush()
    expect(document.querySelector('#stats')?.textContent).toBe('ready')
    expect(document.querySelector('#loading')?.textContent).toBe('false')
  })
})

describe('createBridgeApp without resolve, and withApp', () => {
  it('explains how to get a resolver when none is given', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    await expect(createBridgeApp()).rejects.toThrow(/@swarakaka\/bridge-vite/)
  })

  it('wraps the application in what withApp returns', async () => {
    const Greeting = createContext('none')
    const Page: PageComponent = () => <p id="greeting">{useContext(Greeting)}</p>
    const initial = page({ component: 'Greeting' })
    window.history.replaceState(null, '', initial.url)
    document.body.innerHTML = `<script type="application/json" id="bridge-page">${JSON.stringify(initial)}</script><div id="app"></div>`
    const seen: Array<{ ssr: boolean; component: string | undefined }> = []
    await act(async () => {
      app = await createBridgeApp({
        resolve: () => Page,
        withApp: (tree, context) => {
          seen.push({ ssr: context.ssr, component: context.page?.component })
          return createElement(Greeting.Provider, { value: 'hello' }, tree)
        },
      })
    })
    expect(seen).toEqual([{ ssr: false, component: 'Greeting' }])
    expect(document.querySelector('#greeting')?.textContent).toBe('hello')
  })
})
