import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createBridgeApp, useForm, useProp, BridgeLink } from '../src/index.js'
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
    </form>
  )
}
const components: Record<string, PageComponent> = {
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
})
