import { describe, expect, it, vi } from 'vitest'
import { PageStore, mergeValue, setDeep, getDeep } from '../src/index.js'
import { page } from './helpers.js'

describe('merge helpers', () => {
  it('applies protocol merge modes', () => {
    expect(mergeValue({ a: 1 }, { b: 2 }, 'merge')).toEqual({ a: 1, b: 2 })
    expect(mergeValue([1], [2], 'append')).toEqual([1, 2])
    expect(mergeValue([1], 0, 'prepend')).toEqual([0, 1])
    expect(mergeValue([1], [2])).toEqual([2])
  })

  it('sets and gets dotted keys immutably', () => {
    const props = { a: { b: 1 }, c: 2 }
    const next = setDeep(props, 'a.b', 5)
    expect(next).toEqual({ a: { b: 5 }, c: 2 })
    expect(props.a.b).toBe(1)
    expect(getDeep(next, 'a.b')).toBe(5)
    expect(getDeep(next, 'a.x.y')).toBeUndefined()
  })
})

describe('PageStore', () => {
  it('increments the key on navigation unless state is preserved', () => {
    const store = new PageStore(page())
    const listener = vi.fn()
    store.subscribe(listener)

    store.setPage(page({ url: '/customers?page=2' }), { preserveState: true })
    expect(store.current.key).toBe(0)

    store.setPage(page({ url: '/customers?page=3' }))
    expect(store.current.key).toBe(1)

    store.setPage(page({ component: 'Other' }), { preserveState: true })
    expect(store.current.key).toBe(2)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('merges partial pages only for the same component', () => {
    const store = new PageStore(page())
    store.setPage(page({ props: { stats: { n: 1 } } }), { partial: true })
    expect(store.page?.props).toEqual({
      customers: [{ id: 1 }],
      filters: { search: null },
      stats: { n: 1 },
    })

    store.setPage(page({ component: 'Other', props: { x: 1 } }), { partial: true })
    expect(store.page?.component).toBe('Other')
    expect(store.page?.props).toEqual({ x: 1 })
  })

  it('applies prop control events only for existing keys', () => {
    const store = new PageStore(page())
    expect(store.applyControl({ type: 'prop', key: 'filters.search', value: 'x' })).toBe(true)
    expect((store.page?.props as Record<string, unknown>).filters).toEqual({ search: 'x' })
    expect(store.applyControl({ type: 'prop', key: 'missing', value: 1 })).toBe(false)
    expect(store.applyControl({ type: 'invalidate', keys: ['customers'] })).toBe(false)
  })

  it('tracks deferred loading keys and errors', () => {
    const store = new PageStore(page())
    store.setLoading(['stats'], true)
    expect(store.current.loading.has('stats')).toBe(true)
    store.setLoading(['stats'], false)
    expect(store.current.loading.size).toBe(0)
    store.setError({ status: 403, kind: 'forbidden', message: 'no' })
    expect(store.current.error?.status).toBe(403)
    store.setPage(page())
    expect(store.current.error).toBeNull()
  })
})
