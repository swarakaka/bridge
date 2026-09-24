import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createContext, createElement, useContext, useEffect } from 'react'
import { createBridge, getBridge, PageCache, router } from '@swarakaka/bridge-core'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import {
  BridgeForm,
  BridgeHead,
  BridgeLink,
  createBridgeApp,
  useForm,
  useJson,
  useJsonForm,
  useRemember,
  useFormContext,
  usePage,
  useStream,
} from '../src/index.js'
import type { BridgeApp, BridgeFormInstance, PageComponent } from '../src/index.js'
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

describe('useForm with a Precognition endpoint', () => {
  it('renders valid/invalid during render without looping and validates the bound endpoint', async () => {
    const http = mockFetch((_url, init) =>
      (init.headers as Record<string, string>).Precognition
        ? pageResponse(
            {
              protocol: 1,
              type: 'error',
              error: { status: 422, kind: 'validation', message: 'x', errors: { email: ['Bad'] } },
            },
            422,
          )
        : pageResponse(page({ component: 'Create', url: '/create' })),
    )
    let renders = 0
    const Create: PageComponent = () => {
      renders++
      const form = useForm('post', '/customers', { email: '' }).setValidationTimeout(0)
      return (
        <div>
          <span id="state">
            {form.valid('email') ? 'valid' : form.invalid('email') ? 'invalid' : 'unknown'}
          </span>
          <span id="touched">{String(form.touched('email'))}</span>
          <button
            id="blur"
            onClick={() => {
              form.touch('email')
              void form.validate('email')
            }}
          />
        </div>
      )
    }
    await mount({ Create }, page({ component: 'Create', url: '/create' }), http)
    await flush()
    expect(renders).toBeLessThan(5)

    await act(async () => ($('#blur') as HTMLButtonElement).click())
    await flush()

    expect($('#state')?.textContent).toBe('invalid')
    expect($('#touched')?.textContent).toBe('true')
    const [url, init] = http.mock.calls.at(-1)!
    expect(String(url)).toContain('/customers')
    expect((init.headers as Record<string, string>)['Precognition-Validate-Only']).toBe('email')
  })
})

describe('useJsonForm', () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('submits in JSON mode, re-renders with the result, and maps a 422', async () => {
    let status = 422
    const http = mockFetch(() =>
      status === 422
        ? jsonResponse({ message: 'Invalid.', errors: { name: ['Required'] } }, 422)
        : jsonResponse({ data: { customer: { id: 7 } } }, 201),
    )
    const Create: PageComponent = () => {
      const form = useJsonForm<{ name: string }, { customer: { id: number } }>({ name: '' })
      return (
        <div>
          <span id="error">{form.errors.name ?? ''}</span>
          <span id="status">{String(form.httpStatus)}</span>
          <span id="id">{form.result?.customer.id ?? ''}</span>
          <button id="empty" onClick={() => void form.post('/customers')} />
          <button
            id="fill"
            onClick={() => void form.setData('name', 'Initech').post('/customers')}
          />
        </div>
      )
    }
    await mount({ Create }, page({ component: 'Create', url: '/create' }), http)

    await act(async () => ($('#empty') as HTMLButtonElement).click())
    await flush()
    expect($('#error')?.textContent).toBe('Required')
    expect($('#status')?.textContent).toBe('422')

    status = 201
    await act(async () => ($('#fill') as HTMLButtonElement).click())
    await flush()
    expect($('#error')?.textContent).toBe('')
    expect($('#id')?.textContent).toBe('7')
    const [, init] = http.mock.calls[1]!
    expect((init.headers as Record<string, string>).Accept).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Initech' })
    expect(window.location.pathname).toBe('/create')
  })

  it('re-renders after setData with a callback', async () => {
    const Create: PageComponent = () => {
      const form = useJsonForm({ tags: ['a'] })
      return (
        <div>
          <span id="tags">{form.data.tags.join(',')}</span>
          <button
            id="add"
            onClick={() => form.setData((data) => ({ ...data, tags: [...data.tags, 'b'] }))}
          />
        </div>
      )
    }
    await mount({ Create }, page({ component: 'Create', url: '/create' }))

    await act(async () => ($('#add') as HTMLButtonElement).click())

    expect($('#tags')?.textContent).toBe('a,b')
  })

  it('cancels an in-flight submission on unmount', async () => {
    let aborted = false
    const http = mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborted = true
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }),
    )
    const Create: PageComponent = () => {
      const form = useJsonForm({ name: 'x' })
      return <button id="send" onClick={() => void form.post('/customers')} />
    }
    await mount({ Create }, page({ component: 'Create', url: '/create' }), http)

    await act(async () => ($('#send') as HTMLButtonElement).click())
    await flush()
    act(() => app!.root.unmount())

    expect(aborted).toBe(true)
  })
})

describe('remembered state', () => {
  it.each([
    ['plain', false],
    ['encrypted', true],
  ])(
    'restores useRemember and useForm({ remember }) on back navigation (%s)',
    async (_, encrypted) => {
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
      const meta = encrypted ? { encryptHistory: true } : undefined
      await mount({ Create, Other }, page({ component: 'Create', url: '/create', meta }), http)

      await act(async () => ($('#fill') as HTMLButtonElement).click())
      await flush()
      if (encrypted) {
        // Seals land after Web Crypto answers; the entry then holds nothing readable.
        await act(async () => new Promise((r) => setTimeout(r, 20)))
        expect(window.history.state.sealed).toBeDefined()
        expect(JSON.stringify(window.history.state)).not.toContain('Initech')
      }
      await act(async () => void (await app!.bridge.router.visit('/other')))
      await flush()
      expect($('#other')).not.toBeNull()

      await act(async () => window.history.back())
      await flush()
      await flush()
      if (encrypted) await act(async () => new Promise((r) => setTimeout(r, 20)))
      expect($('#tab')?.textContent).toBe('billing')
      expect($('#name')?.textContent).toBe('Initech')
    },
  )
})

describe('useForm remember key and dontRemember', () => {
  it('takes the remember key first and keeps dontRemember fields out of history', async () => {
    const Login: PageComponent = () => {
      const form = useForm('login', { email: '', password: '' }).dontRemember('password')
      return (
        <div>
          <span id="email">{form.data.email}</span>
          <span id="password">{form.data.password}</span>
          <button
            id="fill"
            onClick={() => form.setData({ email: 'ada@example.com', password: 'secret' })}
          />
        </div>
      )
    }
    const Other: PageComponent = () => <div id="other" />
    const http = mockFetch(() => pageResponse(page({ component: 'Other', url: '/other' })))
    await mount({ Login, Other }, page({ component: 'Login', url: '/login' }), http)

    await act(async () => ($('#fill') as HTMLButtonElement).click())
    await flush()
    expect(JSON.stringify(window.history.state)).toContain('ada@example.com')
    expect(JSON.stringify(window.history.state)).not.toContain('secret')
    await act(async () => void (await app!.bridge.router.visit('/other')))
    await flush()

    await act(async () => window.history.back())
    await flush()
    await flush()
    expect($('#email')?.textContent).toBe('ada@example.com')
    expect($('#password')?.textContent).toBe('')
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
  it('tags its prefetch and passes preserveUrl, showProgress and the array format to the visit', async () => {
    const http = mockFetch((url) =>
      pageResponse(page({ component: 'Home', url: new URL(url).pathname + new URL(url).search })),
    )
    const Home: PageComponent = () => (
      <div>
        <BridgeLink id="users" href="/users" prefetch="mount" cacheTags="users">
          Users
        </BridgeLink>
        <BridgeLink
          id="more"
          href="/customers?page=2"
          data={{ tags: ['a'] }}
          preserveUrl
          showProgress={false}
          queryStringArrayFormat="brackets"
          prefetch={false}
        >
          More
        </BridgeLink>
      </div>
    )
    await mount({ Home }, page({ component: 'Home', url: '/customers?page=1' }), http)
    await flush()
    const key = PageCache.key('/users')
    expect(app!.bridge.cache.get(key).state).toBe('fresh')
    app!.bridge.router.flushByCacheTags(['users'])
    expect(app!.bridge.cache.get(key).state).toBe('miss')

    const progress: boolean[] = []
    app!.bridge.on('start', (visit) => {
      progress.push(visit.showProgress)
    })
    await act(async () => {
      $('#more')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      )
    })
    await flush()

    const more = http.mock.calls
      .map(([url]) => decodeURIComponent(String(url)))
      .find((url) => url.includes('/customers'))
    expect(more).toContain('page=2&tags[]=a')
    expect(progress).toEqual([false])
    expect(window.location.search).toBe('?page=1')
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

  it('applies withApp on the server with ssr: true', async () => {
    const Greeting = createContext('none')
    const Page: PageComponent = () => <p>{useContext(Greeting)}</p>
    const seen: boolean[] = []
    const render = createSsrRenderer({
      resolve: () => Page,
      withApp: (tree, context) => {
        seen.push(context.ssr)
        return createElement(Greeting.Provider, { value: 'hello' }, tree)
      },
    })
    expect((await render(page())).body).toBe('<p>hello</p>')
    expect(seen).toEqual([true])
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

describe('BridgeForm', () => {
  const loginPage = () => pageResponse(page({ component: 'Login', url: '/login' }))
  const invalid = (errors: Record<string, string[]>) =>
    pageResponse(
      {
        protocol: 1,
        type: 'error',
        error: { status: 422, kind: 'validation', message: 'x', errors },
      },
      422,
    )
  const field = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  // React tracks input values; the native setter plus an input event is what typing does.
  const typeInto = (name: string, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        field(name),
        value,
      )
      field(name).dispatchEvent(new Event('input', { bubbles: true }))
    })
  const submitForm = () =>
    act(async () => {
      document.querySelector('form')!.requestSubmit()
    })

  const Fields = ({ form }: { form: BridgeFormInstance }) => (
    <>
      <input name="email" defaultValue="ada@example.com" />
      <input name="password" type="password" defaultValue="" />
      <p id="error">{form.errors.email ?? ''}</p>
      <span id="dirty">{String(form.isDirty)}</span>
      <button id="reset" type="button" onClick={() => form.reset()} />
    </>
  )

  it('reads defaults, tracks typing, submits the values and renders errors', async () => {
    let fail = true
    const http = mockFetch(() => (fail ? invalid({ email: ['Nope'] }) : loginPage()))
    const success = vi.fn()
    const Login: PageComponent = () => (
      <BridgeForm action="/login" onSuccess={success} options={{ preserveState: true }}>
        {(form) => <Fields form={form} />}
      </BridgeForm>
    )
    await mount({ Login }, page({ component: 'Login', url: '/login' }), http)
    expect($('#dirty')?.textContent).toBe('false')

    await typeInto('password', 'secret')
    expect($('#dirty')?.textContent).toBe('true')

    await submitForm()
    await flush()
    expect($('#error')?.textContent).toBe('Nope')
    expect(JSON.parse(String(http.mock.calls.at(-1)![1].body))).toEqual({
      email: 'ada@example.com',
      password: 'secret',
    })

    await act(async () => ($('#reset') as HTMLButtonElement).click())
    expect(field('password').value).toBe('')

    fail = false
    await typeInto('email', 'grace@example.com')
    await submitForm()
    await flush()
    expect(success).toHaveBeenCalledOnce()
    expect($('#dirty')?.textContent).toBe('false')
    expect(field('email').defaultValue).toBe('grace@example.com')
  })

  it('submits in JSON mode, shares the form through context and a ref, and is null outside', async () => {
    const http = mockFetch(
      () =>
        new Response(JSON.stringify({ data: { token: 'abc' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const seen: Array<BridgeFormInstance | null> = []
    const Child = () => {
      const form = useFormContext()
      seen.push(form)
      return <span id="token">{String((form?.result as { token?: string })?.token ?? '')}</span>
    }
    let handle: BridgeFormInstance | null = null
    const Tokens: PageComponent = () => (
      <>
        <BridgeForm action="/tokens" json ref={(r) => void (handle = r)}>
          <input name="name" defaultValue="ci" />
          <Child />
        </BridgeForm>
        <Child />
      </>
    )
    await mount({ Tokens }, page({ component: 'Tokens', url: '/tokens' }), http)

    await act(async () => void (await handle!.submit()))
    await flush()

    const [, init] = http.mock.calls.at(-1)!
    expect((init.headers as Record<string, string>).Accept).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ name: 'ci' })
    expect($('#token')?.textContent).toBe('abc')
    expect(seen.some((form) => form === null)).toBe(true)
  })

  it('resets listed fields after errors and is inert while processing', async () => {
    let release: (r: Response) => void = () => undefined
    const http = mockFetch(() => new Promise<Response>((resolve) => (release = resolve)))
    const Login: PageComponent = () => (
      <BridgeForm action="/login" resetOnError={['password']} disableWhileProcessing>
        {(form) => <Fields form={form} />}
      </BridgeForm>
    )
    await mount({ Login }, page({ component: 'Login', url: '/login' }), http)
    await typeInto('password', 'bad')

    await submitForm()
    expect(document.querySelector('form')!.hasAttribute('inert')).toBe(true)
    await act(async () => release(invalid({ password: ['Wrong'] })))
    await flush()

    expect(document.querySelector('form')!.hasAttribute('inert')).toBe(false)
    expect(field('password').value).toBe('')
    expect(field('email').value).toBe('ada@example.com')
  })
})

describe('optimistic updates', () => {
  it('renders the optimistic value at once and rolls back when the server refuses', async () => {
    let release: (r: Response) => void = () => undefined
    const http = mockFetch(() => new Promise<Response>((resolve) => (release = resolve)))
    const Post: PageComponent = () => {
      const { props } = usePage<{ likes: number }>()
      return (
        <div>
          <span id="likes">{props.likes}</span>
          <button
            id="like"
            onClick={() =>
              void router
                .optimistic((p) => ({ likes: (p.likes as number) + 1 }))
                .post('/posts/1/like')
            }
          />
        </div>
      )
    }
    await mount({ Post }, page({ component: 'Post', url: '/posts/1', props: { likes: 1 } }), http)

    await act(async () => ($('#like') as HTMLButtonElement).click())
    expect($('#likes')?.textContent).toBe('2')

    await act(async () =>
      release(
        pageResponse(
          {
            protocol: 1,
            type: 'error',
            error: { status: 422, kind: 'validation', message: 'No', errors: { likes: ['No'] } },
          },
          422,
        ),
      ),
    )
    await flush()
    expect($('#likes')?.textContent).toBe('1')
  })
})
