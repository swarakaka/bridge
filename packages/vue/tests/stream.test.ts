import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createBridgeApp, useStream } from '../src'
import type { BridgeApp } from '../src'
import { embed, flush, mockFetch, page, pageResponse } from './helpers'

function sseFetch() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const fetchImpl = vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, send: (t: string) => controller?.enqueue(encoder.encode(t)) }
}

let app: BridgeApp | null = null
afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  document.body.innerHTML = ''
})

describe('useStream', () => {
  it('exposes reactive state, receives events and applies prop pushes', async () => {
    const sse = sseFetch()
    const Realtime = defineComponent({
      props: { unread: Number },
      setup(props) {
        const { state, on, lastEventAt } = useStream('/events', { fetch: sse.fetch })
        const log: string[] = []
        on('customer.created', (d) => log.push(JSON.stringify(d)))
        return () => h('div', [h('span', { id: 'state' }, state.value), h('span', { id: 'unread' }, String(props.unread)), h('span', { id: 'log' }, log.join('|')), h('span', { id: 'seen' }, String(lastEventAt.value !== null))])
      },
    })
    const initial = page({ component: 'Realtime', url: '/realtime', props: { unread: 0 } })
    window.history.replaceState(null, '', '/realtime')
    embed(initial)
    app = await createBridgeApp({ resolve: () => Realtime, fetch: mockFetch(() => pageResponse(initial)) })
    await flush()
    sse.send('event: bridge\ndata: {"type":"ready","protocol":1,"replayed":false,"heartbeat":100000,"maxDuration":null}\n\n')
    sse.send('event: customer.created\ndata: {"id":3}\n\nevent: bridge\ndata: {"type":"prop","key":"unread","value":5}\n\n')
    await flush()
    await nextTick()

    expect(document.querySelector('#state')?.textContent).toBe('open')
    expect(document.querySelector('#unread')?.textContent).toBe('5')
    expect(document.querySelector('#log')?.textContent).toBe('{"id":3}')
    expect(document.querySelector('#seen')?.textContent).toBe('true')

    app.app?.unmount()
    await nextTick()
    // Closed on scope dispose.
    expect(app.bridge.store.page).not.toBeNull()
  })
})
