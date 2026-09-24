import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { createBridgeApp, usePoll } from '../src/index.js'
import type { BridgeApp, UsePollReturn } from '../src/index.js'
import { embed, mockFetch, page, pageResponse } from './helpers.js'

let app: BridgeApp | null = null
afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  document.body.innerHTML = ''
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function counting() {
  let n = 0
  const only: string[] = []
  const fetch = mockFetch((_, init) => {
    only.push((init.headers as Record<string, string>)['X-Bridge-Only'] ?? '')
    return pageResponse(page({ component: 'Queue', props: { queue: ++n } }))
  })
  return { fetch, only, count: () => only.length }
}

describe('usePoll', () => {
  it('reloads while mounted and stops on unmount', async () => {
    const server = counting()
    const Queue = defineComponent({
      props: { queue: Number },
      setup(props) {
        const poll = usePoll(30, { only: ['queue'] })
        return () => h('p', { id: 'queue' }, `${String(props.queue)} ${String(poll.active.value)}`)
      },
    })
    embed(page({ component: 'Queue', props: { queue: 0 } }))
    app = await createBridgeApp({ resolve: () => Queue, fetch: server.fetch })

    await wait(300)
    expect(server.count()).toBeGreaterThanOrEqual(2)
    expect(server.only.every((o) => o === 'queue')).toBe(true)
    expect(document.getElementById('queue')!.textContent).toMatch(/^[1-9]\d* true$/)

    app.app!.unmount()
    // A tick already waiting in the router's reload debounce still goes out.
    await wait(100)
    const after = server.count()
    await wait(200)
    expect(server.count()).toBe(after)
  })

  it('waits for start() without autoStart, stops on stop(), restarts when the interval changes', async () => {
    const server = counting()
    const interval = ref(30)
    let poll: UsePollReturn | null = null
    const Queue = defineComponent({
      setup() {
        poll = usePoll(interval, { only: ['queue'] }, { autoStart: false })
        return () => h('p', String(poll!.active.value))
      },
    })
    embed(page({ component: 'Queue', props: {} }))
    app = await createBridgeApp({ resolve: () => Queue, fetch: server.fetch })

    await wait(150)
    expect(server.count()).toBe(0)
    expect(poll!.active.value).toBe(false)

    poll!.start()
    await wait(200)
    expect(server.count()).toBeGreaterThanOrEqual(1)

    poll!.stop()
    await wait(100)
    const stopped = server.count()
    await wait(200)
    expect(server.count()).toBe(stopped)

    // Changing the interval does not restart a poll the component stopped.
    interval.value = 20
    await nextTick()
    await wait(150)
    expect(server.count()).toBe(stopped)
    poll!.start()
    await wait(200)
    expect(server.count()).toBeGreaterThan(stopped)
  })
})
