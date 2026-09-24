import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bridge } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse } from './helpers.js'

let bridge: Bridge | null = null

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/customers')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  bridge?.destroy()
  bridge = null
  vi.useRealTimers()
  setVisibility('visible')
})

/**
 * Advances fake time, then lets the reload that a tick started run: its
 * zero-delay debounce timer needs a fake millisecond, so this adds 3 ms.
 */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(1)
}

const counting = () => {
  let n = 0
  return mockFetch(() => pageResponse(page({ props: { queue: ++n } })))
}

describe('router.poll', () => {
  it('reloads the listed props every interval, one interval after the previous reload settled', async () => {
    let release: (() => void) | null = null
    const fetch = mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(pageResponse(page({ props: { queue: 1 } })))
        }),
    )
    bridge = bridgeWith(fetch)
    const poll = bridge.router.poll(1000, { only: ['queue'] })
    expect(poll.active).toBe(true)

    await advance(900)
    expect(fetch).not.toHaveBeenCalled()
    await advance(100)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('queue')

    // A slow server: no second request while the first is still running.
    await advance(3000)
    expect(fetch).toHaveBeenCalledTimes(1)

    release!()
    await advance(900)
    expect(fetch).toHaveBeenCalledTimes(1)
    await advance(200)
    expect(fetch).toHaveBeenCalledTimes(2)
    poll.stop()
  })

  it('stops, restarts and does not start without autoStart', async () => {
    const fetch = counting()
    bridge = bridgeWith(fetch)
    const poll = bridge.router.poll(500, { only: ['queue'] }, { autoStart: false })
    await advance(2000)
    expect(fetch).not.toHaveBeenCalled()

    poll.start()
    await advance(500)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(bridge.store.page?.props).toMatchObject({ queue: 1 })

    poll.stop()
    poll.stop()
    expect(poll.active).toBe(false)
    await advance(2000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('pauses in a hidden tab and catches up once when it is visible again', async () => {
    const fetch = counting()
    bridge = bridgeWith(fetch)
    const poll = bridge.router.poll(1000, { only: ['queue'] })

    setVisibility('hidden')
    await advance(5000)
    expect(fetch).not.toHaveBeenCalled()

    setVisibility('visible')
    await advance(0)
    expect(fetch).toHaveBeenCalledTimes(1)

    await advance(1100)
    expect(fetch).toHaveBeenCalledTimes(2)
    poll.stop()
  })

  it('does not catch up when no tick was missed, and keeps polling with keepAlive', async () => {
    const fetch = counting()
    bridge = bridgeWith(fetch)
    const paused = bridge.router.poll(1000, { only: ['queue'] })
    setVisibility('hidden')
    await advance(500)
    setVisibility('visible')
    await advance(0)
    expect(fetch).not.toHaveBeenCalled()
    paused.stop()

    const alive = bridge.router.poll(1000, { only: ['queue'] }, { keepAlive: true })
    setVisibility('hidden')
    await advance(2100)
    expect(fetch).toHaveBeenCalledTimes(2)
    alive.stop()
  })

  it('shares a request with a reload in the same debounce window', async () => {
    const fetch = counting()
    bridge = bridgeWith(fetch, { reloadDebounce: 50 })
    const poll = bridge.router.poll(1000, { only: ['queue'] })
    await advance(990)
    void bridge.router.reload({ only: ['stats'] })
    await advance(100)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(header(fetch.calls()[0]!.init, 'X-Bridge-Only')).toBe('stats,queue')
    poll.stop()
  })

  it('stops when another page is shown, unless bindToPage is false', async () => {
    const fetch = mockFetch((url) =>
      pageResponse(url.endsWith('/other') ? page({ component: 'Other', url: '/other' }) : page()),
    )
    bridge = bridgeWith(fetch)
    const bound = bridge.router.poll(1000)
    const free = bridge.router.poll(1000, {}, { bindToPage: false })
    await bridge.router.visit('/other')

    expect(bound.active).toBe(false)
    expect(free.active).toBe(true)
    free.stop()
  })

  it('runs as background work unless the reload asks for progress', async () => {
    const fetch = counting()
    bridge = bridgeWith(fetch)
    const shown: boolean[] = []
    bridge.on('start', (visit) => void shown.push(visit.showProgress))
    const quiet = bridge.router.poll(1000, { only: ['queue'] })
    await advance(1000)
    quiet.stop()
    const loud = bridge.router.poll(1000, { only: ['queue'], showProgress: true })
    await advance(1000)
    loud.stop()
    // An ordinary reload still shows progress.
    void bridge.router.reload({ only: ['stats'] })
    await advance(0)
    expect(shown).toEqual([false, true, true])
  })

  it('reads reload options from a function on every tick', async () => {
    const fetch = counting()
    bridge = bridgeWith(fetch)
    let keys = ['a']
    const poll = bridge.router.poll(1000, () => ({ only: keys }))
    await advance(1000)
    keys = ['b']
    await advance(1100)
    expect(fetch.calls().map((c) => header(c.init, 'X-Bridge-Only'))).toEqual(['a', 'b'])
    poll.stop()
  })
})
