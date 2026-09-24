import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { createBridge, type Bridge, type StoredHistoryState } from '../src/index.js'
import { EPOCH_STORAGE, HistoryCipher, type SealedEntry } from '../src/router/HistoryCipher.js'
import { bridgeWith, mockFetch, page, pageResponse, tick } from './helpers.js'

let bridge: Bridge | null = null

beforeEach(() => {
  window.history.replaceState(null, '', '/customers')
  window.sessionStorage.clear()
  window.localStorage.clear()
})

afterEach(() => {
  bridge?.destroy()
  bridge = null
  vi.restoreAllMocks()
})

const secret = (overrides: Partial<BridgePage> = {}): BridgePage =>
  page({
    component: 'Customers/Show',
    url: '/customers/1',
    props: { customer: { id: 1, email: 'ada@secret.test' } },
    meta: { encryptHistory: true },
    ...overrides,
  })

const stored = (): StoredHistoryState => window.history.state as StoredHistoryState

/** The current entry: its state and its address (a sealed state carries no page URL). */
const current = (): { state: StoredHistoryState; url: string } => ({
  state: stored(),
  url: window.location.pathname + window.location.search,
})

/** Waits for pending seals (Web Crypto runs outside the microtask queue). */
const settle = async (): Promise<void> => {
  await tick()
  await tick()
}

/** What the browser does on back/forward: the entry becomes current, then popstate fires. */
function pop({ state, url }: { state: StoredHistoryState; url: string }): void {
  window.history.replaceState(state, '', url)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
}

describe('HistoryCipher', () => {
  it('round-trips a value with a fresh IV per seal', async () => {
    const cipher = new HistoryCipher(window)
    const a = (await cipher.seal({ n: 1 }))!
    const b = (await cipher.seal({ n: 1 }))!
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv))
    expect(a.kid).toBe(b.kid)
    expect(await cipher.open(a)).toEqual({ n: 1 })
  })

  it('fails closed on tampered data, a replaced key and a missing key', async () => {
    const cipher = new HistoryCipher(window)
    const sealed = (await cipher.seal({ n: 1 }))!
    const bytes = new Uint8Array(sealed.data.slice(0))
    bytes[0] = bytes[0]! ^ 1
    expect(await cipher.open({ ...sealed, data: bytes.buffer })).toBeNull()

    cipher.rotate()
    expect(await cipher.open(sealed)).toBeNull()
    expect(window.localStorage.getItem(EPOCH_STORAGE)).toBe('1')

    const other = (await cipher.seal({ n: 2 }))!
    window.sessionStorage.clear()
    expect(await cipher.open(other)).toBeNull()
  })

  it('drops its key when another tab bumped the epoch', async () => {
    const cipher = new HistoryCipher(window)
    const sealed = (await cipher.seal({ n: 1 }))!
    expect(cipher.replaced()).toBe(false)
    window.localStorage.setItem(EPOCH_STORAGE, '7')
    expect(cipher.replaced()).toBe(true)
    expect(await cipher.open(sealed)).toBeNull()
  })
})

describe('encrypted history entries', () => {
  it('stores marked pages sealed, with only scroll and ids in clear', async () => {
    const fetch = mockFetch(() => pageResponse(secret()))
    bridge = bridgeWith(fetch)
    await bridge.router.visit('/customers/1')

    // Pushed at once without the page, so the address changes with the render.
    expect(window.location.pathname).toBe('/customers/1')
    expect(stored().page).toBeUndefined()

    await settle()
    const state = stored()
    expect(state.sealed).toMatchObject({ v: 1 })
    expect(state.page).toBeUndefined()
    expect(state.remember).toBeUndefined()
    expect(state.scroll).toEqual({ window: [0, 0], regions: [] })
    expect(JSON.stringify(state)).not.toContain('secret')
  })

  it('leaves unmarked pages as before', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page({ url: '/customers/2' }))))
    await bridge.router.visit('/customers/2')
    await settle()
    expect(stored().sealed).toBeUndefined()
    expect(stored().page?.url).toBe('/customers/2')
  })

  it('restores a sealed entry on popstate without a request, remembered state included', async () => {
    const fetch = mockFetch((url) =>
      pageResponse(url.endsWith('/customers/1') ? secret() : page({ url: '/customers/2' })),
    )
    bridge = bridgeWith(fetch)
    await bridge.router.visit('/customers/1')
    bridge.router.remember('note', { text: 'draft' })
    expect(bridge.router.restore('note')).toEqual({ text: 'draft' })
    await settle()
    const entry = current()

    await bridge.router.visit('/customers/2')
    pop(entry)
    await settle()

    expect(bridge.store.page?.component).toBe('Customers/Show')
    expect(bridge.store.page?.props).toEqual(secret().props)
    expect(bridge.router.restore('note')).toEqual({ text: 'draft' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('moves the address at once when a sealed page changes its URL, even if a write follows', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(secret())))
    await bridge.router.visit('/customers/1')
    await settle()

    bridge.history.updatePage(secret({ url: '/customers/1?page=2' }))
    bridge.router.remember('note', 1)
    expect(window.location.search).toBe('?page=2')
    await settle()
    expect(window.location.search).toBe('?page=2')
    const opened = await new HistoryCipher(window).open(stored().sealed!)
    expect(opened).toMatchObject({ page: { url: '/customers/1?page=2' }, remember: { note: 1 } })
  })

  it('restores remembered state of an encrypted page after a full reload', async () => {
    bridge = bridgeWith(
      mockFetch(() => pageResponse(secret())),
      { initialPage: secret() },
    )
    bridge.router.remember('note', { text: 'draft' })
    bridge.router.remember('tab', 'billing')
    await settle()
    expect(stored().sealed).toBeDefined()
    bridge.destroy()

    // The reload: a new document boots the same page over the sealed entry.
    bridge = bridgeWith(
      mockFetch(() => pageResponse(secret())),
      { initialPage: secret() },
    )
    const restored: Array<Record<string, unknown>> = []
    bridge.on('restore', ({ values }) => void restored.push(values))
    // Written since boot: wins over the decrypted value.
    bridge.router.remember('tab', 'general')
    expect(bridge.router.restore('note')).toBeUndefined()
    await settle()

    // Every decrypted value is offered; history only took the key it did not have.
    expect(restored).toEqual([{ note: { text: 'draft' }, tab: 'billing' }])
    expect(bridge.router.restore('note')).toEqual({ text: 'draft' })
    expect(bridge.router.restore('tab')).toBe('general')
  })

  it('drops the late restore when the user already left the page', async () => {
    const fetch = mockFetch(() => pageResponse(page({ url: '/customers/2' })))
    bridge = bridgeWith(fetch, { initialPage: secret() })
    bridge.router.remember('note', 1)
    await settle()
    bridge.destroy()

    bridge = bridgeWith(fetch, { initialPage: secret() })
    const restored = vi.fn()
    bridge.on('restore', restored)
    await bridge.router.visit('/customers/2')
    await settle()
    expect(restored).not.toHaveBeenCalled()
    expect(bridge.router.restore('note')).toBeUndefined()
  })

  it('keeps the latest of several quick writes', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(secret())))
    await bridge.router.visit('/customers/1')
    bridge.router.patchProps({ customer: { id: 1, email: 'second' } })
    bridge.router.patchProps({ customer: { id: 1, email: 'third' } })
    await settle()

    const opened = await new HistoryCipher(window).open(stored().sealed!)
    expect(opened).toMatchObject({ page: { props: { customer: { email: 'third' } } } })
  })

  it('requests the page again once a clearHistory page replaced the key', async () => {
    const fetch = mockFetch((url) =>
      pageResponse(
        url.endsWith('/login')
          ? page({
              component: 'Auth/Login',
              url: '/login',
              props: {},
              meta: { clearHistory: true },
            })
          : secret(),
      ),
    )
    bridge = bridgeWith(fetch)
    await bridge.router.prefetch('/customers/1')
    await bridge.router.visit('/customers/1')
    await settle()
    const entry = current()

    await bridge.router.visit('/login')
    expect(bridge.cache.size).toBe(0)

    pop(entry)
    await settle()

    // The prefetched copy was dropped with the key: the entry is requested again.
    expect(fetch.calls().map((c) => new URL(c.url).pathname)).toEqual([
      '/customers/1',
      '/login',
      '/customers/1',
    ])
    expect(bridge.store.page?.component).toBe('Customers/Show')
  })

  it('requests the page again when another tab cleared history', async () => {
    const fetch = mockFetch(() => pageResponse(secret()))
    bridge = bridgeWith(fetch)
    await bridge.router.visit('/customers/1')
    await settle()
    const entry = current()

    window.localStorage.setItem(EPOCH_STORAGE, '1')
    pop(entry)
    await settle()

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('clears on a booted page too (an HTML redirect after logout)', async () => {
    const cipher = new HistoryCipher(window)
    const sealed = (await cipher.seal({ page: secret(), remember: {} }))!
    bridge = bridgeWith(
      mockFetch(() => pageResponse(secret())),
      {
        initialPage: page({ component: 'Auth/Login', url: '/login', meta: { clearHistory: true } }),
      },
    )
    expect(await cipher.open(sealed)).toBeNull()
  })

  it('never stores the page when Web Crypto is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(HistoryCipher.prototype, 'available').mockReturnValue(false)
    const fetch = mockFetch((url) =>
      pageResponse(url.endsWith('/customers/1') ? secret() : page({ url: '/customers/2' })),
    )
    bridge = bridgeWith(fetch)
    await bridge.router.visit('/customers/1')
    bridge.router.remember('note', 1)
    await settle()

    const entry = current()
    expect(entry.state.page).toBeUndefined()
    expect(entry.state.sealed).toBeUndefined()
    expect(bridge.router.restore('note')).toBe(1)
    expect(warn).toHaveBeenCalledTimes(1)

    await bridge.router.visit('/customers/2')
    pop(entry)
    await settle()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('drops a seal that finishes after the user left the entry', async () => {
    let release: () => void = () => undefined
    const seal = HistoryCipher.prototype.seal
    vi.spyOn(HistoryCipher.prototype, 'seal').mockImplementation(async function (
      this: HistoryCipher,
      value: unknown,
    ): Promise<SealedEntry | null> {
      await new Promise<void>((resolve) => (release = resolve))
      return seal.call(this, value)
    })
    bridge = bridgeWith(
      mockFetch((url) =>
        pageResponse(url.endsWith('/customers/1') ? secret() : page({ url: '/customers/2' })),
      ),
    )
    await bridge.router.visit('/customers/1')
    await bridge.router.visit('/customers/2')
    release()
    await settle()

    expect(stored().page?.url).toBe('/customers/2')
    expect(stored().sealed).toBeUndefined()
  })
})

describe('back-forward cache', () => {
  function fakeWindow(reload: () => void): { win: Window; fire: (e: Event) => void } {
    const listeners: Record<string, Array<(e: Event) => void>> = {}
    const win = {} as Window
    Object.defineProperty(win, 'location', {
      value: {
        get href() {
          return window.location.href
        },
        reload,
      },
    })
    for (const key of ['history', 'document', 'crypto', 'sessionStorage', 'localStorage'] as const)
      Object.defineProperty(win, key, { value: window[key] })
    Object.defineProperty(win, 'addEventListener', {
      value: (type: string, fn: (e: Event) => void) => (listeners[type] ??= []).push(fn),
    })
    Object.defineProperty(win, 'removeEventListener', { value: () => undefined })
    return { win, fire: (e) => listeners[e.type]?.forEach((fn) => fn(e)) }
  }

  it('reloads a restored document whose encrypted page lost its key', async () => {
    const reload = vi.fn()
    const { win, fire } = fakeWindow(reload)
    bridge = createBridge({
      initialPage: secret(),
      window: win,
      fetch: mockFetch(() => pageResponse(secret())),
    })
    bridge.init()
    await settle()

    const pageshow = (persisted: boolean) => {
      const event = new Event('pageshow') as PageTransitionEvent
      Object.defineProperty(event, 'persisted', { value: persisted })
      fire(event)
    }

    pageshow(true)
    expect(reload).not.toHaveBeenCalled()

    // Another document of this tab (the logout) replaced the key.
    window.sessionStorage.clear()
    pageshow(false)
    expect(reload).not.toHaveBeenCalled()
    pageshow(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
