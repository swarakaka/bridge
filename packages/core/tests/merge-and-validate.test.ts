import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendProp, PageStore } from '../src/pages/PageStore.js'
import { bridgeWith, header, mockFetch, page, pageResponse } from './helpers.js'
import type { Bridge } from '../src/createBridge.js'

describe('merge props', () => {
  it('appends arrays and paginator data for keys listed in meta.merge', () => {
    const store = new PageStore(
      page({
        props: { items: [1], list: { data: [{ id: 1 }], meta: { current_page: 1 } }, other: 'a' },
      }),
    )
    store.setPage(
      page({
        props: { items: [2], list: { data: [{ id: 2 }], meta: { current_page: 2 } }, other: 'b' },
        meta: { merge: ['items', 'list'] },
      }),
      { partial: true, merge: true },
    )
    expect(store.page?.props).toEqual({
      items: [1, 2],
      list: { data: [{ id: 1 }, { id: 2 }], meta: { current_page: 2 } },
      other: 'b',
    })

    // Without opting in (invalidations, searches) the keys are replaced.
    store.setPage(page({ props: { items: [9] }, meta: { merge: ['items'] } }), { partial: true })
    expect((store.page?.props as Record<string, unknown>).items).toEqual([9])
  })

  it('replaces when the key is not a merge key or shapes differ', () => {
    expect(appendProp([1], 'x')).toBe('x')
    expect(appendProp({ a: 1 }, { a: 2 })).toEqual({ a: 2 })
  })
})

describe('Form.validate (Precognition)', () => {
  let bridge: Bridge | null = null
  beforeEach(() => window.history.replaceState(null, '', '/customers/create'))
  afterEach(() => bridge?.destroy())

  it('sends the precognition headers, scopes errors to the field, and clears on 204', async () => {
    let status = 422
    const fetch = mockFetch(() =>
      status === 422
        ? pageResponse(
            {
              protocol: 1,
              type: 'error',
              error: {
                status: 422,
                kind: 'validation',
                message: 'x',
                errors: { email: ['Invalid'], name: ['Required'] },
              },
            },
            { status: 422 },
          )
        : new Response(null, { status: 204, headers: { 'Precognition-Success': 'true' } }),
    )
    bridge = bridgeWith(fetch, { initialPage: page({ url: '/customers/create' }) })
    const form = bridge.form({ email: 'bad', name: '' })
    form.setError('name', 'Existing')

    await form.validate('post', '/customers', 'email')
    expect(header(fetch.calls()[0]!.init, 'Precognition')).toBe('true')
    expect(header(fetch.calls()[0]!.init, 'Precognition-Validate-Only')).toBe('email')
    expect(form.errors).toEqual({ name: 'Existing', email: 'Invalid' })
    expect(window.location.pathname).toBe('/customers/create')

    status = 204
    await form.validate('post', '/customers', 'email')
    expect(form.errors).toEqual({ name: 'Existing' })
    expect(form.validating).toBe(false)
  })
})
