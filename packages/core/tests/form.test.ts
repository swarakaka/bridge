import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bridgeWith, mockFetch, page, pageResponse, tick } from './helpers.js'
import type { Bridge } from '../src/createBridge.js'

let bridge: Bridge | null = null
beforeEach(() => window.history.replaceState(null, '', '/customers/create'))
afterEach(() => bridge?.destroy())

describe('Form', () => {
  it('tracks dirty state, resets and defaults', () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ name: '', tags: ['a'] })
    expect(form.isDirty).toBe(false)
    form.setData('name', 'x')
    expect(form.isDirty).toBe(true)
    form.reset('name')
    expect(form.data.name).toBe('')
    form.setData({ name: 'y' }).setDefaults()
    expect(form.isDirty).toBe(false)
    form.reset()
    expect(form.data).toEqual({ name: 'y', tags: ['a'] })
  })

  it('sets errors from a 422 and clears them on success', async () => {
    let fail = true
    const fetch = mockFetch(() =>
      fail
        ? pageResponse(
            {
              protocol: 1,
              type: 'error',
              error: {
                status: 422,
                kind: 'validation',
                message: 'x',
                errors: { name: ['Required', 'Too short'] },
              },
            },
            { status: 422 },
          )
        : pageResponse(page({ component: 'Customers/Show', url: '/customers/1', props: {} })),
    )
    bridge = bridgeWith(fetch)
    const form = bridge.form({ name: '' }, { recentlySuccessfulFor: 10 })

    const outcome = await form.post('/customers')
    expect(outcome.status).toBe('invalid')
    expect(form.errors).toEqual({ name: 'Required' })
    expect(form.allErrors.name).toEqual(['Required', 'Too short'])
    expect(form.hasErrors).toBe(true)
    expect(form.processing).toBe(false)

    fail = false
    form.setData('name', 'Acme')
    await form.post('/customers')
    expect(form.hasErrors).toBe(false)
    expect(form.wasSuccessful).toBe(true)
    expect(form.recentlySuccessful).toBe(true)
    expect(form.isDirty).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(form.recentlySuccessful).toBe(false)
  })

  it('applies transform and resetOnSuccess', async () => {
    const fetch = mockFetch(() => pageResponse(page({ component: 'X', url: '/x', props: {} })))
    bridge = bridgeWith(fetch)
    const form = bridge.form({ name: 'a' }, { resetOnSuccess: true })
    form.transform((data) => ({ ...data, extra: true }))
    form.setData('name', 'b')
    await form.post('/customers')
    expect(fetch.calls()[0]!.init.body).toBe('{"name":"b","extra":true}')
    expect(form.data.name).toBe('a')
  })

  it('reports processing while a request is in flight and supports cancel', async () => {
    let resolve: (r: Response) => void = () => {}
    const fetch = mockFetch(() => new Promise<Response>((r) => (resolve = r)))
    bridge = bridgeWith(fetch)
    const form = bridge.form({ name: 'a' })
    const submit = form.post('/customers')
    await tick()
    expect(form.processing).toBe(true)
    form.cancel()
    resolve(pageResponse(page()))
    expect((await submit).status).toBe('cancelled')
    expect(form.processing).toBe(false)
  })
})
