// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { defineComponent, h, inject } from 'vue'
import { createSsrRenderer, createSsrServer } from '../src/server/index.js'
import { BridgeHead, InfiniteScroll, usePage, usePoll, WhenVisible } from '../src/index.js'
import { page } from './helpers.js'

const Layout = defineComponent({
  setup(_, { slots }) {
    return () => h('main', { id: 'layout' }, slots.default?.())
  },
})
const Index = defineComponent({
  props: { customers: { type: Array, default: () => [] }, title: String },
  setup(props) {
    const { url } = usePage()
    return () =>
      h('div', [
        h(BridgeHead, {
          title: `${props.title} · Bridge`,
          meta: [{ name: 'description', content: 'List' }],
        }),
        h('h1', props.title),
        h('p', { id: 'url' }, url.value),
        h(
          'ul',
          (props.customers as Array<{ name: string }>).map((c) => h('li', c.name)),
        ),
      ])
  },
})
;(Index as unknown as { layout: unknown }).layout = Layout

describe('SSR renderer', () => {
  it('renders InfiniteScroll with its manual controls and loads nothing', async () => {
    const List = defineComponent({
      setup: () => () => h(InfiniteScroll, { data: 'items' }, { default: () => h('ul', 'items') }),
    })
    const render = createSsrRenderer({ resolve: () => List })
    const result = await render(
      page({
        component: 'List',
        props: { items: { data: [] } },
        meta: {
          scroll: {
            items: {
              pageName: 'page',
              dataPath: 'data',
              currentPage: 2,
              previousPage: 1,
              nextPage: 3,
            },
          },
        },
      }),
    )
    expect(result.body).toContain('data-bridge-scroll="previous"')
    expect(result.body).toContain('<ul>items</ul>')
    expect(result.body).toContain('data-bridge-scroll="next"')
  })

  it('starts no poll while rendering on the server', async () => {
    const Queue = defineComponent({
      setup() {
        const poll = usePoll(10, { only: ['queue'] })
        return () => h('p', String(poll.active.value))
      },
    })
    const render = createSsrRenderer({ resolve: () => Queue })
    expect((await render(page({ component: 'Queue', props: {} }))).body).toContain('<p>false</p>')
  })

  it('renders the WhenVisible fallback without observing or loading', async () => {
    const Show = defineComponent({
      setup: () => () =>
        h(
          WhenVisible,
          { data: 'activity' },
          {
            default: () => h('p', 'ready'),
            fallback: () => h('p', 'later'),
          },
        ),
    })
    const render = createSsrRenderer({ resolve: () => Show })
    const result = await render(page({ component: 'Show', props: {} }))
    expect(result.body).toContain('<div><p>later</p></div>')
    expect((await render(page({ component: 'Show', props: { activity: [] } }))).body).toContain(
      '<div><p>ready</p></div>',
    )
  })

  it('renders a page with layout, props and head fragments', async () => {
    const render = createSsrRenderer({ resolve: () => Index })
    const result = await render(page())
    expect(result.body).toContain('<main id="layout">')
    expect(result.body).toContain('<h1>Customers</h1>')
    expect(result.body).toContain('<li>Acme</li>')
    expect(result.body).toContain('<p id="url">/customers</p>')
    expect(result.head).toEqual([
      '<title>Customers · Bridge</title>',
      '<meta name="description" content="List" data-bridge-head="ssr">',
    ])
  })

  it('serves POST /render over HTTP and rejects bad input', async () => {
    const render = createSsrRenderer({ resolve: () => Index })
    const server = await createSsrServer({ render, port: 0 })
    const base = `http://127.0.0.1:${server.port}`
    try {
      const ok = await fetch(`${base}/render`, { method: 'POST', body: JSON.stringify(page()) })
      expect(ok.status).toBe(200)
      expect(((await ok.json()) as { body: string }).body).toContain('<li>Acme</li>')
      expect((await fetch(`${base}/render`, { method: 'POST', body: '{nope' })).status).toBe(400)
      expect(
        (await fetch(`${base}/render`, { method: 'POST', body: '{"type":"nope"}' })).status,
      ).toBe(422)
      expect((await fetch(`${base}/health`)).status).toBe(200)
    } finally {
      await server.close()
    }
  })

  it('applies withApp with ssr: true', async () => {
    const Greeting = defineComponent({
      setup() {
        const greeting = inject<string>('greeting')
        return () => h('p', greeting)
      },
    })
    const seen: Array<{ ssr: boolean; component: string | undefined }> = []
    const render = createSsrRenderer({
      resolve: () => Greeting,
      withApp: (app, context) => {
        seen.push({ ssr: context.ssr, component: context.page?.component })
        app.provide('greeting', 'hello')
      },
    })
    const result = await render(page())
    expect(result.body).toContain('>hello</p>')
    expect(seen).toEqual([{ ssr: true, component: 'Customers/Index' }])
  })

  it('needs a resolver without the Vite plugin', () => {
    expect(() => createSsrRenderer()).toThrow(/createSsrRenderer needs a `resolve` function/)
  })
})
