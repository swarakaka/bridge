import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonClient, JsonForm, PageStore, RequestManager } from '../src/index.js'
import type { Bridge, BridgePage } from '../src/index.js'
import { bridgeWith, mockFetch, page, pageResponse } from './helpers.js'

/** One top-level prop of a page (props are typed `{}`). */
const prop = (p: BridgePage | null | undefined, key: string): unknown =>
  (p?.props as Record<string, unknown> | undefined)?.[key]

const post = (likes: number, extra: Record<string, unknown> = {}): BridgePage =>
  page({ component: 'Posts/Show', url: '/posts/1', props: { likes, title: 'Hi', ...extra } })

describe('PageStore optimistic layer', () => {
  it('rolls a failed update back and keeps a succeeded one', () => {
    const store = new PageStore(post(1))

    const a = store.applyOptimistic({ likes: 2 })!
    expect(prop(store.page, 'likes')).toBe(2)
    expect(prop(store.serverPage, 'likes')).toBe(1)
    store.settleOptimistic(a, 'server')
    expect(prop(store.page, 'likes')).toBe(1)

    const b = store.applyOptimistic({ likes: 5 })!
    store.settleOptimistic(b, 'keep')
    expect(prop(store.page, 'likes')).toBe(5)
  })

  it('keeps the newest value while another update still holds the prop', () => {
    const store = new PageStore(post(1))
    const a = store.applyOptimistic({ likes: 2 })!
    const b = store.applyOptimistic({ likes: 3 })!

    store.settleOptimistic(a, 'server')
    expect(prop(store.page, 'likes')).toBe(3)

    store.settleOptimistic(b, 'server')
    expect(prop(store.page, 'likes')).toBe(1)
  })

  it('routes server data for a held prop to its snapshot and shows it on release', () => {
    const store = new PageStore(post(1))
    const token = store.applyOptimistic({ likes: 2 })!

    store.applyControl({ type: 'prop', key: 'likes', value: 7 })
    store.setPage(post(8, { title: 'New' }), { partial: true })
    expect(store.page?.props as Record<string, unknown>).toMatchObject({ likes: 2, title: 'New' })
    expect(prop(store.serverPage, 'likes')).toBe(8)

    store.settleOptimistic(token, 'server')
    expect(prop(store.page, 'likes')).toBe(8)
  })

  it('patchProps is server data too', () => {
    const store = new PageStore(post(1))
    const token = store.applyOptimistic({ likes: 2 })!

    store.patchProps({ likes: 4, title: 'Patched' })
    expect(store.page?.props as Record<string, unknown>).toMatchObject({
      likes: 2,
      title: 'Patched',
    })

    store.settleOptimistic(token, 'server')
    expect(prop(store.page, 'likes')).toBe(4)
  })

  it('discards pending updates when another page instance is shown', () => {
    const store = new PageStore(post(1))
    const token = store.applyOptimistic({ likes: 2 })!

    store.setPage(post(9))
    store.settleOptimistic(token, 'server')

    expect(prop(store.page, 'likes')).toBe(9)
  })
})

describe('optimistic visits', () => {
  let bridge: Bridge | null = null
  beforeEach(() => window.history.replaceState(null, '', '/posts/1'))
  afterEach(() => {
    bridge?.destroy()
    bridge = null
  })

  const errorPage = (status: number, kind: string) =>
    pageResponse(
      { protocol: 1, type: 'error', error: { status, kind, message: 'No', errors: { x: ['y'] } } },
      { status },
    )

  it.each([
    ['a validation error', () => errorPage(422, 'validation')],
    ['an error response', () => errorPage(500, 'server')],
  ])('rolls back after %s', async (_name, respond) => {
    bridge = bridgeWith(mockFetch(respond), { initialPage: post(1) })
    bridge.on('error', () => false)
    const seen: unknown[] = []

    const pending = bridge.router
      .optimistic((props) => ({ likes: (props.likes as number) + 1 }))
      .post('/posts/1/like', {}, { onStart: () => seen.push(prop(bridge!.router.page, 'likes')) })
    await pending

    expect(seen).toEqual([2])
    expect(prop(bridge.router.page, 'likes')).toBe(1)
  })

  it('rolls back after a network failure', async () => {
    bridge = bridgeWith(
      mockFetch(() => {
        throw new TypeError('offline')
      }),
      { initialPage: post(1) },
    )
    bridge.on('exception', (exception) => exception.preventDefault())

    await bridge.router.post('/posts/1/like', {}, { optimistic: () => ({ likes: 2 }) })

    expect(prop(bridge.router.page, 'likes')).toBe(1)
  })

  it('shows the server page after a success', async () => {
    bridge = bridgeWith(
      mockFetch(() => pageResponse(post(10))),
      { initialPage: post(1) },
    )

    await bridge.router
      .optimistic(() => ({ likes: 2 }))
      .post('/posts/1/like', {}, { preserveState: true })

    expect(prop(bridge.router.page, 'likes')).toBe(10)
  })

  it('a newer optimistic visit cancelling an older one keeps the newest value', async () => {
    const pending: Array<(r: Response) => void> = []
    bridge = bridgeWith(
      mockFetch(
        (_url, init) =>
          new Promise<Response>((resolve, reject) => {
            pending.push(resolve)
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
      { initialPage: post(1) },
    )
    const like = () =>
      bridge!.router
        .optimistic((props) => ({ likes: (props.likes as number) + 1 }))
        .post('/posts/1/like', {}, { preserveState: true })

    const first = like()
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const second = like()
    expect(await first).toEqual({ status: 'cancelled' })
    expect(prop(bridge.router.page, 'likes')).toBe(3)

    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1]!(pageResponse(post(2)))
    await second
    expect(prop(bridge.router.page, 'likes')).toBe(2)
  })

  it('never writes optimistic values to history state', async () => {
    let release: (r: Response) => void = () => undefined
    bridge = bridgeWith(
      mockFetch((url) =>
        url.includes('like')
          ? new Promise<Response>((resolve) => (release = resolve))
          : pageResponse(post(1, { title: 'Reloaded' })),
      ),
      { initialPage: post(1) },
    )
    const liked = bridge.router.post('/posts/1/like', {}, { optimistic: () => ({ likes: 99 }) })
    await vi.waitFor(() => expect(prop(bridge!.router.page, 'likes')).toBe(99))

    bridge.router.patchProps({ title: 'Patched' })
    const stored = JSON.stringify(window.history.state)
    expect(stored).toContain('Patched')
    expect(stored).not.toContain('99')

    release(errorPage(500, 'server'))
    bridge.on('error', () => false)
    await liked
  })
})

describe('optimistic forms', () => {
  let bridge: Bridge | null = null
  afterEach(() => {
    bridge?.destroy()
    bridge = null
  })

  it('form.optimistic applies to the next submission only, with the form data', async () => {
    bridge = bridgeWith(
      mockFetch(() =>
        pageResponse(
          {
            protocol: 1,
            type: 'error',
            error: {
              status: 422,
              kind: 'validation',
              message: 'x',
              errors: { body: ['Required'] },
            },
          },
          { status: 422 },
        ),
      ),
      { initialPage: post(1, { comments: ['a'] }) },
    )
    const form = bridge.form({ body: 'b' })
    const shown: unknown[] = []
    const onStart = () => shown.push(prop(bridge!.router.page, 'comments'))

    await form
      .optimistic((props, data) => ({ comments: [...(props.comments as string[]), data.body] }))
      .post('/comments', { onStart, onInvalid: () => undefined })
    await form.post('/comments', { onStart, onInvalid: () => undefined })

    expect(shown).toEqual([['a', 'b'], ['a']])
    expect(prop(bridge.router.page, 'comments')).toEqual(['a'])
  })

  it('a JSON form keeps optimistic values on success and rolls back on failure', async () => {
    const store = new PageStore(post(1))
    let status = 201
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(status === 201 ? { data: { likes: 2 } } : { message: 'No' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch
    const client = new JsonClient(new RequestManager({ fetch: fetchImpl, xsrfCookie: () => 't' }))
    const form = new JsonForm(client, {}, {}, store)

    await form.optimistic((props) => ({ likes: (props.likes as number) + 1 })).post('/like')
    expect(prop(store.page, 'likes')).toBe(2)

    status = 500
    await form.post('/like', { optimistic: (props) => ({ likes: (props.likes as number) + 1 }) })
    expect(prop(store.page, 'likes')).toBe(2)
  })
})
