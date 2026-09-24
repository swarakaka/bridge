// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createSsrRenderer, createSsrServer } from '../src/server/index.js'
import { BridgeHead, usePage } from '../src/index.js'
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
})
