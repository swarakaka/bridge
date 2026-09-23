import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createBridgeApp, useJson } from '../src/index.js'
import type { BridgeApp } from '../src/index.js'
import { embed, flush, mockFetch, page, pageResponse } from './helpers.js'

let app: BridgeApp | null = null
afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  document.body.innerHTML = ''
})

describe('useJson', () => {
  it('exposes a reactive JSON-mode request', async () => {
    const Page = defineComponent({
      setup() {
        const json = useJson<{ customer: { name: string } }>()
        return () =>
          h('div', [
            h('span', { id: 'processing' }, String(json.processing)),
            h('span', { id: 'name' }, json.data?.customer.name ?? '-'),
            h('span', { id: 'error' }, json.errors.email ?? '-'),
            h('span', { id: 'status' }, String(json.httpStatus)),
            h('button', {
              id: 'create',
              onClick: () => json.post('/customers', { data: { email: '' } }),
            }),
            h('button', {
              id: 'fix',
              onClick: () => json.post('/customers', { data: { email: 'a@b.c' } }),
            }),
          ])
      },
    })
    const initial = page({ component: 'Json', url: '/json', props: {} })
    window.history.replaceState(null, '', '/json')
    embed(initial)
    const seen: Array<Record<string, string>> = []
    app = await createBridgeApp({
      resolve: () => Page,
      fetch: mockFetch((url, init) => {
        const headers = init.headers as Record<string, string>
        seen.push(headers)
        if (headers.Accept !== 'application/json') return pageResponse(initial)
        const body = JSON.parse(String(init.body)) as { email: string }
        if (!body.email)
          return new Response(
            JSON.stringify({
              message: 'Invalid.',
              errors: { email: ['The email field is required.'] },
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          )
        return new Response(
          JSON.stringify({ data: { customer: { name: 'Acme' } }, meta: { location: `${url}/1` } }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    })
    await flush()
    expect(document.querySelector('#processing')?.textContent).toBe('false')

    document.querySelector<HTMLButtonElement>('#create')?.click()
    await nextTick()
    expect(document.querySelector('#processing')?.textContent).toBe('true')
    await flush()
    await nextTick()
    expect(document.querySelector('#processing')?.textContent).toBe('false')
    expect(document.querySelector('#error')?.textContent).toBe('The email field is required.')
    expect(document.querySelector('#status')?.textContent).toBe('422')
    expect(seen[0]?.Accept).toBe('application/json')

    document.querySelector<HTMLButtonElement>('#fix')?.click()
    await flush()
    await nextTick()
    expect(document.querySelector('#name')?.textContent).toBe('Acme')
    expect(document.querySelector('#error')?.textContent).toBe('-')
    expect(document.querySelector('#status')?.textContent).toBe('201')
  })
})
