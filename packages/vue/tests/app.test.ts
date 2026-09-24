import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, inject, nextTick } from 'vue'
import {
  createBridgeApp,
  useForm,
  usePage,
  useProp,
  BridgeLink,
  Deferred,
  useDeferred,
} from '../src/index.js'
import type { BridgeApp } from '../src/index.js'
import { embed, flush, mockFetch, page, pageResponse } from './helpers.js'

const Index = defineComponent({
  props: { customers: { type: Array, default: () => [] }, title: String },
  setup(props) {
    const title = useProp<string>('title')
    return () =>
      h('div', { id: 'index' }, [
        h('h1', title.value),
        h(
          'ul',
          (props.customers as Array<{ id: number; name: string }>).map((c) => h('li', c.name)),
        ),
      ])
  },
})

const Show = defineComponent({
  props: { id: Number },
  setup(props) {
    const { component } = usePage()
    return () => h('div', { id: 'show' }, `${component.value}:${props.id}`)
  },
})

const Layout = defineComponent({
  setup(_, { slots }) {
    return () => h('main', { id: 'layout' }, slots.default?.())
  },
})
;(Show as unknown as { layout: unknown }).layout = Layout

const Dashboard = defineComponent({
  setup() {
    const { loading } = useDeferred('stats')
    return () =>
      h('div', { id: 'dash' }, [
        h('span', { id: 'loading' }, String(loading.value)),
        h(
          Deferred,
          { data: 'stats' },
          {
            default: () => h('span', { id: 'stats' }, 'ready'),
            fallback: () => h('span', { id: 'fallback' }, 'loading'),
          },
        ),
      ])
  },
})

const Create = defineComponent({
  setup() {
    const form = useForm({ name: '' })
    return () =>
      h(
        'form',
        {
          id: 'create',
          onSubmit: (e: Event) => {
            e.preventDefault()
            void form.post('/customers')
          },
        },
        [
          h('input', {
            id: 'name',
            value: form.data.name,
            onInput: (e: Event) => (form.data.name = (e.target as HTMLInputElement).value),
          }),
          form.errors.name ? h('p', { id: 'error' }, form.errors.name) : null,
          h('span', { id: 'processing' }, String(form.processing)),
        ],
      )
  },
})

const Forbidden = defineComponent({
  props: { status: Number, message: String },
  setup(props) {
    return () => h('div', { id: 'forbidden' }, `${props.status} ${props.message}`)
  },
})

const components: Record<string, unknown> = {
  'Customers/Index': Index,
  'Customers/Show': Show,
  Dashboard,
  'Customers/Create': Create,
}

let app: BridgeApp | null = null

afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  document.body.innerHTML = ''
})

async function mount(fetchImpl: typeof fetch, initial = page()): Promise<BridgeApp> {
  window.history.replaceState(null, '', initial.url)
  embed(initial)
  app = await createBridgeApp({
    resolve: (name) => components[name] as never,
    resolveError: (status) => (status === 403 ? Forbidden : null),
    fetch: fetchImpl,
    reloadDebounce: 0,
  })
  return app
}

describe('createBridgeApp', () => {
  it('mounts the embedded page and renders its props', async () => {
    await mount(mockFetch(() => pageResponse(page())))
    expect(document.querySelector('#index h1')?.textContent).toBe('Customers')
    expect(document.querySelectorAll('#index li')).toHaveLength(1)
  })

  it('navigates through BridgeLink and applies layouts', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: { id: 1 } })),
    )
    const { bridge } = await mount(fetch)

    await bridge.router.visit('/customers/1')
    await nextTick()

    expect(document.querySelector('#layout #show')?.textContent).toBe('Customers/Show:1')
    expect(window.location.pathname).toBe('/customers/1')
  })

  it('renders links that visit on click and prefetch on hover', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Customers/Show', url: '/customers/2', props: { id: 2 } })),
    )
    const { app: vueApp } = await mount(fetch)

    const holder = document.createElement('div')
    document.body.appendChild(holder)
    const linkApp = (await import('vue')).createApp({
      render: () => h(BridgeLink, { href: '/customers/2', prefetch: 'mount' }, () => 'go'),
    })
    linkApp.provide((await import('../src/index.js')).BridgeKey, app!.bridge)
    linkApp.mount(holder)
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)

    holder
      .querySelector('a')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await flush()
    expect(document.querySelector('#show')?.textContent).toBe('Customers/Show:2')
    expect(fetch).toHaveBeenCalledTimes(1)
    linkApp.unmount()
    expect(vueApp).not.toBeNull()
  })

  it('shows deferred fallbacks until the group loads', async () => {
    const fetch = mockFetch((_, init) => {
      const only = (init.headers as Record<string, string>)['X-Bridge-Only']
      if (only === 'stats')
        return pageResponse(page({ component: 'Dashboard', url: '/', props: { stats: { n: 1 } } }))
      return pageResponse(
        page({ component: 'Dashboard', url: '/', props: {}, deferred: { default: ['stats'] } }),
      )
    })
    const { bridge } = await mount(fetch)

    await bridge.router.visit('/')
    await nextTick()
    expect(document.querySelector('#fallback')?.textContent).toBe('loading')
    expect(document.querySelector('#loading')?.textContent).toBe('true')

    await flush()
    await nextTick()
    expect(document.querySelector('#stats')?.textContent).toBe('ready')
    expect(document.querySelector('#loading')?.textContent).toBe('false')
  })

  it('binds forms reactively and shows validation errors', async () => {
    const fetch = mockFetch((url) =>
      url.endsWith('/customers') && true
        ? pageResponse(
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
          )
        : pageResponse(page()),
    )
    await mount(fetch, page({ component: 'Customers/Create', url: '/customers/create', props: {} }))

    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flush()
    await nextTick()

    expect(document.querySelector('#error')?.textContent).toBe('Name is required.')
    expect(document.querySelector('#processing')?.textContent).toBe('false')
  })

  it('renders the resolved error component for non-validation errors', async () => {
    let forbidden = true
    const fetch = mockFetch(() =>
      forbidden
        ? pageResponse(
            {
              protocol: 1,
              type: 'error',
              error: { status: 403, kind: 'forbidden', message: 'Locked' },
            },
            403,
          )
        : pageResponse(page()),
    )
    const { bridge } = await mount(fetch)

    await bridge.router.visit('/customers/1/edit')
    await flush()
    await nextTick()

    expect(document.querySelector('#forbidden')?.textContent).toBe('403 Locked')

    // A successful navigation clears the error.
    forbidden = false
    await bridge.router.visit('/customers')
    await nextTick()
    expect(document.querySelector('#index')).not.toBeNull()
  })
})

describe('createBridgeApp without resolve, and withApp', () => {
  it('explains how to get a resolver when none is given', async () => {
    embed(page())
    await expect(createBridgeApp()).rejects.toThrow(/@swarakaka\/bridge-vite/)
    await expect(createBridgeApp({ pages: './Pages' })).rejects.toThrow(
      /`pages` option is compiled by the @swarakaka\/bridge-vite plugin/,
    )
  })

  it('refuses setup and withApp together', async () => {
    embed(page())
    await expect(
      createBridgeApp({ resolve: () => Index, setup: () => undefined, withApp: () => undefined }),
    ).rejects.toThrow('pass `setup` or `withApp`, not both')
  })

  it('customises the app before it mounts', async () => {
    const Greeting = defineComponent({
      setup() {
        const greeting = inject<string>('greeting')
        return () => h('p', { id: 'greeting' }, greeting)
      },
    })
    const calls: Array<{ ssr: boolean; component: string | undefined; mounted: boolean }> = []
    const initial = page({ component: 'Greeting' })
    window.history.replaceState(null, '', initial.url)
    embed(initial)
    app = await createBridgeApp({
      resolve: () => Greeting,
      withApp: (vueApp, { ssr, page: current }) => {
        calls.push({ ssr, component: current?.component, mounted: vueApp._container !== null })
        vueApp.provide('greeting', 'hello')
      },
    })
    expect(calls).toEqual([{ ssr: false, component: 'Greeting', mounted: false }])
    expect(document.querySelector('#greeting')?.textContent).toBe('hello')
  })
})
