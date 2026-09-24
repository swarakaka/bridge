import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, type Component } from 'vue'
import { createBridge, getBridge, PageCache } from '@swarakaka/bridge-core'
import { BridgeHead, BridgeLink, createBridgeApp, useStream } from '../src/index.js'
import { createSsrRenderer } from '../src/server/index.js'
import type { BridgeApp } from '../src/index.js'
import { embed, flush, mockFetch, page, pageResponse } from './helpers.js'

let app: BridgeApp | null = null
afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  document.title = ''
})

describe('hydration-safe useStream', () => {
  it('renders the idle state first and connects once mounted', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(new ReadableStream({ start() {} }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    ) as unknown as typeof globalThis.fetch
    const renders: string[] = []
    const Realtime = defineComponent({
      setup() {
        const { state } = useStream('/events', { fetch })
        return () => {
          renders.push(state.value)
          return h('span', { id: 'state' }, state.value)
        }
      },
    })
    embed(page({ component: 'Realtime', props: {} }))
    app = await createBridgeApp({
      resolve: () => Realtime,
      fetch: mockFetch(() => pageResponse(page())),
    })
    await flush()

    // The server renders 'idle'; the first client render must match it.
    expect(renders[0]).toBe('idle')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(document.getElementById('state')!.textContent).toBe('open')
  })
})

describe('error components', () => {
  it('does not show an error component that finished loading after a newer error', async () => {
    const releases = new Map<number, (c: Component) => void>()
    const errorFor = (status: number) =>
      defineComponent({ setup: () => () => h('p', { id: 'error' }, `component ${status}`) })
    embed(page())
    app = await createBridgeApp({
      resolve: () => defineComponent({ setup: () => () => h('div', 'page') }),
      resolveError: (status) => new Promise<Component>((r) => releases.set(status, r)),
      fetch: mockFetch(() => pageResponse(page())),
    })

    app.bridge.store.setError({ status: 404, kind: 'not_found', message: 'Missing' })
    await nextTick()
    app.bridge.store.setError({ status: 500, kind: 'server', message: 'Boom' })
    await nextTick()
    releases.get(404)!(errorFor(404))
    await flush()
    expect(document.getElementById('error')).toBeNull()

    releases.get(500)!(errorFor(500))
    await flush()
    expect(document.getElementById('error')!.textContent).toBe('component 500')
  })
})

describe('BridgeLink', () => {
  it('updates its active class after navigation inside a persistent layout', async () => {
    // A layout that re-renders with the same link props and a stable compiled slot
    // (`$stable`, as compiled templates imply): Vue skips updating the link itself.
    const Layout = defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', [
            h(
              BridgeLink,
              { href: '/customers/1', activeClass: 'active', id: 'link' },
              { default: () => 'Show', $stable: true },
            ),
            slots.default?.(),
          ]),
    })
    const Page = defineComponent({ layout: Layout, setup: () => () => h('p', 'page') })
    embed(page())
    app = await createBridgeApp({
      resolve: () => Page,
      fetch: mockFetch(() => pageResponse(page({ url: '/customers/1', props: {} }))),
    })
    const link = () => document.getElementById('link')!

    expect(link().classList.contains('active')).toBe(false)
    await app.bridge.router.visit('/customers/1')
    await nextTick()
    expect(link().classList.contains('active')).toBe(true)
  })
})

describe('BridgeLink visit options', () => {
  it('tags its prefetch and passes preserveUrl, showProgress and the array format to the visit', async () => {
    window.history.replaceState(null, '', '/customers?page=1')
    const Page = defineComponent({
      setup: () => () =>
        h('div', [
          h(
            BridgeLink,
            { href: '/users', prefetch: 'mount', cacheTags: 'users', id: 'users' },
            { default: () => 'Users' },
          ),
          h(
            BridgeLink,
            {
              href: '/customers?page=2',
              data: { tags: ['a'] },
              preserveUrl: true,
              showProgress: false,
              queryStringArrayFormat: 'brackets',
              prefetch: false,
              id: 'more',
            },
            { default: () => 'More' },
          ),
        ]),
    })
    embed(page({ url: '/customers?page=1' }))
    const fetch = mockFetch((url) =>
      pageResponse(page({ url: new URL(url).pathname + new URL(url).search, props: {} })),
    )
    app = await createBridgeApp({ resolve: () => Page, fetch })
    await flush()
    const users = PageCache.key('/users')
    expect(app.bridge.cache.get(users).state).toBe('fresh')
    app.bridge.router.flushByCacheTags('users')
    expect(app.bridge.cache.get(users).state).toBe('miss')

    const progress: boolean[] = []
    app.bridge.on('start', (visit) => {
      progress.push(visit.showProgress)
    })
    document.getElementById('more')!.click()
    await flush()

    const calls = (fetch as unknown as { mock: { calls: Array<[string]> } }).mock.calls
    const more = calls
      .map((c) => decodeURIComponent(String(c[0])))
      .find((u) => u.includes('/customers'))
    expect(more).toContain('page=2&tags[]=a')
    expect(progress).toEqual([false])
    expect(window.location.search).toBe('?page=1')
  })
})

describe('BridgeHead on the client', () => {
  it('owns its meta tags, replaces server-rendered ones and restores the title', async () => {
    document.head.innerHTML = '<meta name="description" content="Old" data-bridge-head="ssr">'
    document.title = 'App'
    const WithHead = defineComponent({
      setup: () => () =>
        h(BridgeHead, { title: 'Customers', meta: [{ name: 'description', content: 'List' }] }),
    })
    const Plain = defineComponent({ setup: () => () => h('div', 'plain') })
    embed(page())
    app = await createBridgeApp({
      resolve: (name) => (name === 'Plain' ? Plain : WithHead),
      fetch: mockFetch(() => pageResponse(page({ component: 'Plain', url: '/plain', props: {} }))),
    })
    await nextTick()

    const metas = () => Array.from(document.head.querySelectorAll('meta[name="description"]'))
    expect(document.title).toBe('Customers')
    expect(metas().map((m) => m.getAttribute('content'))).toEqual(['List'])

    await app.bridge.router.visit('/plain')
    await flush()
    expect(metas()).toHaveLength(0)
    expect(document.title).toBe('App')
  })
})

describe('SSR renderer', () => {
  it('does not replace the global bridge instance', async () => {
    const own = createBridge({ initialPage: page(), window: undefined })
    const render = createSsrRenderer({
      resolve: () => defineComponent({ setup: () => () => h('div', 'x') }),
    })

    await render(page())

    expect(getBridge()).toBe(own)
    own.destroy()
  })
})

describe('remembered state', () => {
  it('restores remembered state after a full reload of an encrypted page, unless changed meanwhile', async () => {
    const { useRemember, useForm } = await import('../src/index.js')
    const Create = defineComponent({
      setup() {
        const tab = useRemember('tab', 'general')
        const note = useRemember('note', '')
        // dontRemember() is chained after useForm(): the restore must still apply.
        const form = useForm({ name: '', password: '' }, { remember: 'create' }).dontRemember(
          'password',
        )
        return () =>
          h('div', [
            h('span', { id: 'tab' }, tab.value),
            h('span', { id: 'note' }, note.value),
            h('span', { id: 'name' }, form.data.name),
            h('button', {
              id: 'fill',
              onClick: () => {
                tab.value = 'billing'
                note.value = 'draft'
                form.data.name = 'Initech'
              },
            }),
            h('button', { id: 'type', onClick: () => (note.value = 'typed after reload') }),
          ])
      },
    })
    window.history.replaceState(null, '', '/customers/create')
    const secret = page({
      component: 'Create',
      url: '/customers/create',
      props: {},
      meta: { encryptHistory: true },
    })
    embed(secret)
    app = await createBridgeApp({
      resolve: () => Create,
      fetch: mockFetch(() => pageResponse(secret)),
    })
    document.getElementById('fill')!.click()
    await flush()
    await new Promise((r) => setTimeout(r, 20))
    expect(window.history.state.sealed).toBeDefined()
    app.bridge.destroy()
    app.app!.unmount()

    // The reload: a new app boots the same page over the sealed entry.
    embed(secret)
    app = await createBridgeApp({
      resolve: () => Create,
      fetch: mockFetch(() => pageResponse(secret)),
    })
    document.getElementById('type')!.click()
    await flush()
    await new Promise((r) => setTimeout(r, 30))

    expect(document.getElementById('tab')!.textContent).toBe('billing')
    expect(document.getElementById('name')!.textContent).toBe('Initech')
    // Changed before the decrypted state arrived: the user's value stays.
    expect(document.getElementById('note')!.textContent).toBe('typed after reload')
  })

  it.each([
    ['plain', false],
    ['encrypted', true],
  ])(
    'restores useRemember and useForm({ remember }) on back navigation (%s)',
    async (_, encrypted) => {
      const { useRemember, useForm } = await import('../src/index.js')
      const Create = defineComponent({
        setup() {
          const tab = useRemember('tab', 'general')
          const form = useForm({ name: '' }, { remember: 'create' })
          return () =>
            h('div', { id: 'create' }, [
              h('span', { id: 'tab' }, tab.value),
              h('span', { id: 'name' }, form.data.name),
              h('button', {
                id: 'fill',
                onClick: () => {
                  tab.value = 'billing'
                  form.data.name = 'Initech'
                },
              }),
            ])
        },
      })
      const Other = defineComponent({ setup: () => () => h('div', { id: 'other' }) })
      window.history.replaceState(null, '', '/customers/create')
      const meta = encrypted ? { meta: { encryptHistory: true } } : {}
      embed(page({ component: 'Create', url: '/customers/create', props: {}, ...meta }))
      app = await createBridgeApp({
        resolve: (name) => (name === 'Other' ? Other : Create),
        fetch: mockFetch(() =>
          pageResponse(page({ component: 'Other', url: '/other', props: {} })),
        ),
      })

      document.getElementById('fill')!.click()
      await flush()
      if (encrypted) {
        // Seals land after Web Crypto answers; the entry then holds nothing readable.
        await new Promise((r) => setTimeout(r, 20))
        expect(window.history.state.sealed).toBeDefined()
        expect(JSON.stringify(window.history.state)).not.toContain('Initech')
      }
      await app.bridge.router.visit('/other')
      await flush()
      expect(document.getElementById('other')).not.toBeNull()

      window.history.back()
      await flush()
      await flush()
      if (encrypted) await new Promise((r) => setTimeout(r, 20))
      expect(document.getElementById('tab')!.textContent).toBe('billing')
      expect(document.getElementById('name')!.textContent).toBe('Initech')
    },
  )
})
