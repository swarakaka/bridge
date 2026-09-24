import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { combineProp, PageStore, readMergeKeys, readMergeModes, type Bridge } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse } from './helpers.js'

describe('combineProp', () => {
  it('appends and prepends lists and paginator data', () => {
    expect(combineProp([1, 2], [3], 'append')).toEqual([1, 2, 3])
    expect(combineProp([1, 2], [0], 'prepend')).toEqual([0, 1, 2])
    expect(
      combineProp(
        { data: [{ id: 2 }], meta: { page: 1 } },
        { data: [{ id: 1 }], meta: { page: 2 } },
        'prepend',
      ),
    ).toEqual({ data: [{ id: 1 }, { id: 2 }], meta: { page: 2 } })
  })

  it('replaces matched items in place and adds the others at the right end', () => {
    const current = [
      { id: 1, v: 'a' },
      { id: 2, v: 'b' },
    ]
    const incoming = [
      { id: 2, v: 'B' },
      { id: 3, v: 'c' },
    ]
    expect(combineProp(current, incoming, 'append', ['id'])).toEqual([
      { id: 1, v: 'a' },
      { id: 2, v: 'B' },
      { id: 3, v: 'c' },
    ])
    expect(combineProp(current, incoming, 'prepend', ['id'])).toEqual([
      { id: 3, v: 'c' },
      { id: 1, v: 'a' },
      { id: 2, v: 'B' },
    ])
  })

  it('follows match paths into paginators and nested lists', () => {
    const page1 = { data: [{ id: 21 }, { id: 20 }], links: { next: 2 } }
    // A customer was created meanwhile: page 2 starts with the last row of page 1.
    const page2 = { data: [{ id: 20 }, { id: 19 }], links: { next: 3 } }
    expect(combineProp(page1, page2, 'append', ['data.id'])).toEqual({
      data: [{ id: 21 }, { id: 20 }, { id: 19 }],
      links: { next: 3 },
    })
    // Without a path for `data`, a top-level `id` path does not apply to it.
    expect(combineProp(page1, page2, 'append', ['id'])).toMatchObject({
      data: [{ id: 21 }, { id: 20 }, { id: 20 }, { id: 19 }],
    })
  })

  it('deep-merges objects at every depth, appending arrays and matching nested lists', () => {
    const current = {
      theme: { dark: false, accent: 'blue' },
      thread: { title: 'Hi', messages: [{ id: 1, body: 'one' }] },
      tags: ['a'],
    }
    const incoming = {
      theme: { dark: true },
      thread: {
        messages: [
          { id: 1, body: 'edited' },
          { id: 2, body: 'two' },
        ],
      },
      tags: ['b'],
      extra: 1,
    }
    expect(combineProp(current, incoming, 'deep', ['thread.messages.id'])).toEqual({
      theme: { dark: true, accent: 'blue' },
      thread: {
        title: 'Hi',
        messages: [
          { id: 1, body: 'edited' },
          { id: 2, body: 'two' },
        ],
      },
      tags: ['a', 'b'],
      extra: 1,
    })
    expect(combineProp({ a: [1] }, { a: { b: 1 } }, 'deep')).toEqual({ a: { b: 1 } })
  })

  it('keeps items without the key and takes incoming values on type mismatches', () => {
    expect(combineProp([{ id: 1 }, 'x'], [{ id: 1, n: 2 }, 'x'], 'append', ['id'])).toEqual([
      { id: 1, n: 2 },
      'x',
      'x',
    ])
    expect(combineProp([1], { a: 1 }, 'append')).toEqual({ a: 1 })
  })
})

describe('reading merge members', () => {
  const withMeta = (meta: Record<string, unknown>): BridgePage => page({ meta })

  it('reads each mode and its match paths', () => {
    const p = withMeta({
      merge: ['customers'],
      prepend: ['messages'],
      deepMerge: ['settings'],
      matchOn: { customers: ['data.id'], messages: ['id'] },
    })
    expect(readMergeModes(p)).toEqual({
      customers: { mode: 'append', matchOn: ['data.id'] },
      messages: { mode: 'prepend', matchOn: ['id'] },
      settings: { mode: 'deep', matchOn: [] },
    })
    expect(readMergeKeys(p)).toEqual(['customers', 'messages', 'settings'])
  })

  it('ignores malformed members', () => {
    expect(readMergeModes(withMeta({ merge: 'x', prepend: [1, 'ok'], matchOn: [] }))).toEqual({
      ok: { mode: 'prepend', matchOn: [] },
    })
  })
})

describe('PageStore merge option', () => {
  const store = () =>
    new PageStore(page({ props: { feed: [{ id: 2 }], other: 1 }, meta: { prepend: ['feed'] } }))
  const partial = page({
    props: { feed: [{ id: 1 }, { id: 2, edited: true }] },
    meta: { prepend: ['feed'], matchOn: { feed: ['id'] } },
  })

  it('uses each key mode with true, and a direction override for every key', () => {
    const own = store()
    own.setPage(partial, { partial: true, merge: true })
    expect(own.page?.props).toEqual({ feed: [{ id: 1 }, { id: 2, edited: true }], other: 1 })

    const appended = store()
    appended.setPage(partial, { partial: true, merge: 'append' })
    expect((appended.page?.props as Record<string, unknown>).feed).toEqual([
      { id: 2, edited: true },
      { id: 1 },
    ])

    const replaced = store()
    replaced.setPage(partial, { partial: true })
    expect((replaced.page?.props as Record<string, unknown>).feed).toEqual(
      (partial.props as Record<string, unknown>).feed,
    )
  })
})

describe('merging reloads', () => {
  let bridge: Bridge | null = null
  beforeEach(() => window.history.replaceState(null, '', '/customers'))
  afterEach(() => {
    bridge?.destroy()
    bridge = null
  })

  const feed = (items: unknown[]) =>
    page({ props: { feed: items }, meta: { merge: ['feed'], matchOn: { feed: ['id'] } } })

  it('merges a reload that asks for it, and replaces when coalesced callers disagree', async () => {
    const fetch = mockFetch(() => pageResponse(feed([{ id: 2 }])))
    bridge = bridgeWith(fetch, { initialPage: feed([{ id: 1 }]) })

    await bridge.router.reload({ only: ['feed'], merge: true })
    expect((bridge.store.page?.props as Record<string, unknown>).feed).toEqual([
      { id: 1 },
      { id: 2 },
    ])

    await Promise.all([
      bridge.router.reload({ only: ['feed'], merge: true }),
      bridge.router.reload({ only: ['feed'] }),
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(header(fetch.calls()[1]!.init, 'X-Bridge-Only')).toBe('feed')
    expect((bridge.store.page?.props as Record<string, unknown>).feed).toEqual([{ id: 2 }])
  })
})
