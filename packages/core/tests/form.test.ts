import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bridgeWith, mockFetch, page, pageResponse, tick } from './helpers.js'
import type { Bridge } from '../src/index.js'

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

describe('Form helpers', () => {
  it('resets and clears errors together, for all or some fields', () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ name: '', email: '' })
    form.setData({ name: 'x', email: 'y' }).setError({ name: 'Bad', email: 'Worse' })

    form.resetAndClearErrors('name')
    expect(form.data).toEqual({ name: '', email: 'y' })
    expect(form.errors).toEqual({ email: 'Worse' })

    form.resetAndClearErrors()
    expect(form.data).toEqual({ name: '', email: '' })
    expect(form.hasErrors).toBe(false)
  })

  it('leaves dontRemember fields out of rememberable values', () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ email: 'a@b.c', password: 'secret' })

    expect(form.rememberable()).toEqual({ email: 'a@b.c', password: 'secret' })
    expect(form.dontRemember('password')).toBe(form)
    expect(form.rememberable()).toEqual({ email: 'a@b.c' })
    expect(form.rememberable({ email: 'x', password: 'old' })).toEqual({ email: 'x' })
  })
})

describe('Form.setData with a callback', () => {
  it('merges what the callback returns from the current data', () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ name: 'a', tags: ['x'] })

    form.setData((data) => ({ ...data, tags: [...data.tags, 'y'] }))
    form.setData((data) => ({ name: data.name.toUpperCase() }))

    expect(form.data).toEqual({ name: 'A', tags: ['x', 'y'] })
    expect(form.isDirty).toBe(true)
  })
})

describe('validation errors passed only to onError', () => {
  const invalid = () =>
    pageResponse(
      {
        protocol: 1,
        type: 'error',
        error: { status: 422, kind: 'validation', message: 'x', errors: { name: ['Required'] } },
      },
      { status: 422 },
    )

  it('warns once per form when a 422 reaches a submit that passed only onError', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    bridge = bridgeWith(mockFetch(invalid))
    const form = bridge.form({ name: '' })
    const onError = vi.fn()

    await form.post('/customers', { onError })
    await form.post('/customers', { onError })

    expect(onError).not.toHaveBeenCalled()
    expect(form.errors).toEqual({ name: 'Required' })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('form.post()')
    expect(warn.mock.calls[0]?.[0]).toContain('onInvalid')
    warn.mockRestore()
  })

  it('stays quiet when onInvalid is passed, or neither callback is', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    bridge = bridgeWith(mockFetch(invalid))

    await bridge.form({ name: '' }).post('/customers', { onError: vi.fn(), onInvalid: vi.fn() })
    await bridge.form({ name: '' }).post('/customers')

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns for validate() too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    bridge = bridgeWith(mockFetch(invalid), { initialPage: page({ url: '/customers/create' }) })

    await bridge.form({ name: '' }).validate('post', '/customers', 'name', { onError: vi.fn() })

    expect(warn.mock.calls[0]?.[0]).toContain('form.validate()')
    warn.mockRestore()
  })
})

describe('app-wide form defaults', () => {
  it('config.forms applies to every form, and a form’s own options win', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      bridge = bridgeWith(
        mockFetch(() => pageResponse(page())),
        {
          forms: { recentlySuccessfulFor: 5000 },
        },
      )
      const app = bridge.form({ name: '' })
      const own = bridge.form({ name: '' }, { recentlySuccessfulFor: 100 })
      const json = bridge.jsonForm({ name: '' })

      // One page visit at a time: a second one would cancel the first.
      await app.post('/a')
      await own.post('/b')
      await vi.advanceTimersByTimeAsync(2500)
      expect(app.recentlySuccessful).toBe(true)
      expect(own.recentlySuccessful).toBe(false)
      await vi.advanceTimersByTimeAsync(2500)
      expect(app.recentlySuccessful).toBe(false)
      expect(
        (json as unknown as { options: { recentlySuccessfulFor?: number } }).options
          .recentlySuccessfulFor,
      ).toBe(5000)
    } finally {
      vi.useRealTimers()
    }
  })
})
