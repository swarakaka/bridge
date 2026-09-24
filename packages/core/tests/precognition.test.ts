import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonClient, JsonForm, RequestManager } from '../src/index.js'
import type { Bridge } from '../src/index.js'
import { bridgeWith, header, mockFetch, page, pageResponse } from './helpers.js'

let bridge: Bridge | null = null
beforeEach(() => window.history.replaceState(null, '', '/customers/create'))
afterEach(() => {
  bridge?.destroy()
  bridge = null
  vi.useRealTimers()
})

const invalid = (errors: Record<string, string[]>) =>
  pageResponse(
    {
      protocol: 1,
      type: 'error',
      error: { status: 422, kind: 'validation', message: 'x', errors },
    },
    { status: 422 },
  )
const passed = () =>
  new Response(null, { status: 204, headers: { 'Precognition-Success': 'true' } })

/** A page form bound to POST /customers; `answer` decides each Precognition response. */
function boundForm<T extends Record<string, unknown>>(
  initial: T,
  answer: (only: string | undefined, init: RequestInit) => Response = () => passed(),
) {
  const fetch = mockFetch((_url, init) => {
    if (header(init, 'Precognition'))
      return answer(header(init, 'Precognition-Validate-Only'), init)
    return pageResponse(page({ url: '/customers/1' }))
  })
  bridge = bridgeWith(fetch, { initialPage: page({ url: '/customers/create' }) })
  const form = bridge.form(initial).withPrecognition('post', '/customers')
  const validations = () =>
    fetch.calls().filter((call) => header(call.init, 'Precognition') !== undefined)
  return { form, fetch, validations }
}

describe('Precognition with a bound endpoint', () => {
  it('validates one field against the bound endpoint and tracks valid/invalid', async () => {
    const { form, validations } = boundForm({ email: 'bad', name: '' }, (only) =>
      only === 'email' ? invalid({ email: ['Invalid'], name: ['Required'] }) : passed(),
    )
    form.setValidationTimeout(0)

    const outcome = await form.validate('email')
    expect(outcome.status).toBe('invalid')
    expect(header(validations()[0]!.init, 'Precognition-Validate-Only')).toBe('email')
    expect(validations()[0]!.url).toContain('/customers')
    expect(form.errors).toEqual({ email: 'Invalid' })
    expect(form.invalid('email')).toBe(true)
    expect(form.valid('email')).toBe(false)
    expect(form.valid('name')).toBe(false)

    await form.validate('name')
    expect(form.valid('name')).toBe(true)
    expect(form.invalid('name')).toBe(false)
  })

  it('validate() without fields validates the touched ones, and nothing when none are', async () => {
    const { form, validations } = boundForm({ email: '', name: '', notes: '' })
    form.setValidationTimeout(0)

    expect(await form.validate()).toEqual({ status: 'cancelled' })
    expect(validations()).toHaveLength(0)
    expect(form.touched()).toBe(false)

    form.touch('email').touch(['name'])
    expect(form.touched('email')).toBe(true)
    expect(form.touched('notes')).toBe(false)
    expect(form.touched()).toBe(true)

    await form.validate()
    expect(header(validations()[0]!.init, 'Precognition-Validate-Only')).toBe('email,name')

    await form.validate({ only: ['notes'] })
    expect(header(validations()[1]!.init, 'Precognition-Validate-Only')).toBe('notes')
  })

  it('validate(field) does not touch the field; touch() without fields touches all', async () => {
    const { form } = boundForm({ email: '', name: '' })
    form.setValidationTimeout(0)

    await form.validate('email')
    expect(form.touched('email')).toBe(false)

    form.touch()
    expect(form.touched('email') && form.touched('name')).toBe(true)
  })

  it('sends the first call at once and combines later calls in the window into one request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { form, validations } = boundForm({ a: '', b: '', c: '' })

    const first = form.validate('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(validations()).toHaveLength(1)

    const second = form.validate('b')
    const third = form.validate('c')
    await vi.advanceTimersByTimeAsync(1000)
    expect(validations()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1500)
    expect(validations()).toHaveLength(2)
    expect(header(validations()[1]!.init, 'Precognition-Validate-Only')).toBe('b,c')
    expect((await first).status).toBe('success')
    expect(await second).toEqual(await third)
    expect(form.valid('b') && form.valid('c')).toBe(true)
  })

  it('setValidationTimeout changes the window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { form, validations } = boundForm({ a: '', b: '' })
    form.setValidationTimeout(200)

    void form.validate('a')
    void form.validate('b')
    await vi.advanceTimersByTimeAsync(199)
    expect(validations()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(validations()).toHaveLength(2)
  })

  it('leaves files out of validation requests unless validateFiles() was called', async () => {
    const { form, validations } = boundForm({ name: '', avatar: null as File | null })
    form.setValidationTimeout(0)
    form.setData('avatar', new File(['x'], 'a.png'))

    await form.validate(['name', 'avatar'])
    const init = validations()[0]!.init
    expect(header(init, 'Precognition-Validate-Only')).toBe('name')
    expect(JSON.parse(String(init.body))).toEqual({ name: '' })

    expect(await form.validate('avatar')).toEqual({ status: 'cancelled' })
    expect(validations()).toHaveLength(1)

    form.validateFiles()
    await form.validate('avatar')
    expect((validations()[1]!.init.body as FormData).get('avatar')).toBeInstanceOf(File)
  })

  it('the explicit validate(method, url, field) still sends at once with every value', async () => {
    const { form, validations } = boundForm({ name: '', avatar: null as File | null })
    form.setData('avatar', new File(['x'], 'a.png'))

    void form.validate('post', '/customers', 'name')
    void form.validate('post', '/customers', 'avatar')
    await vi.waitFor(() => expect(validations()).toHaveLength(2))
    expect((validations()[1]!.init.body as FormData).get('avatar')).toBeInstanceOf(File)
  })

  it('onBefore returning false skips the request', async () => {
    const { form, validations } = boundForm({ name: '' })
    form.setValidationTimeout(0)

    expect(await form.validate('name', { onBefore: () => false })).toEqual({ status: 'cancelled' })
    expect(validations()).toHaveLength(0)
  })

  it('reset() forgets touched and validated state', async () => {
    const { form } = boundForm({ name: '', email: '' })
    form.setValidationTimeout(0)
    form.touch('name', 'email')
    await form.validate('name')
    await form.validate('email')

    form.reset('name')
    expect(form.touched('name')).toBe(false)
    expect(form.valid('name')).toBe(false)
    expect(form.valid('email')).toBe(true)

    form.reset()
    expect(form.touched()).toBe(false)
    expect(form.valid('email')).toBe(false)
  })

  it('submit() without a method and URL uses the bound endpoint', async () => {
    const { form, fetch } = boundForm({ name: 'Acme' })

    const outcome = await form.submit({ preserveScroll: true })

    expect(outcome.status).toBe('success')
    const call = fetch.calls().at(-1)!
    expect(call.url).toContain('/customers')
    expect(call.init.method?.toUpperCase()).toBe('POST')
  })

  it('refuses validate(field) and submit() without an endpoint', () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ name: '' })

    expect(() => form.validate('name')).toThrow(/withPrecognition/)
    expect(() => form.submit()).toThrow(/withPrecognition/)
  })

  it('works the same on a JSON form', async () => {
    const calls: RequestInit[] = []
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {})
      const headers = (init?.headers ?? {}) as Record<string, string>
      return headers.Precognition
        ? new Response(JSON.stringify({ message: 'x', errors: { email: ['Invalid'] } }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response(JSON.stringify({ data: { id: 1 } }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
    }) as unknown as typeof fetch
    const client = new JsonClient(new RequestManager({ fetch: fetchImpl, xsrfCookie: () => 't' }))
    const form = new JsonForm(client, { email: '' })
      .withPrecognition('post', '/customers')
      .setValidationTimeout(0)

    await form.validate('email')
    expect(form.invalid('email')).toBe(true)
    expect((calls[0]!.headers as Record<string, string>).Accept).toBe('application/json')

    await form.submit()
    expect(form.result).toEqual({ id: 1 })
  })
})
