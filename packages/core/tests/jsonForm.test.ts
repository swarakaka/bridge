import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonClient, JsonForm, RequestManager } from '../src/index.js'
import type { JsonOutcome } from '../src/index.js'

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup<T extends Record<string, unknown>, R = unknown>(
  initial: T,
  handler: Handler,
  options: ConstructorParameters<typeof JsonForm<T, R>>[2] = {},
) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init: init ?? {} })
    return handler(url, init ?? {})
  }) as unknown as typeof fetch
  const http = new RequestManager({ fetch: fetchImpl, xsrfCookie: () => 'token' })
  const onMutate = vi.fn()
  const client = new JsonClient(http, onMutate)
  const form = new JsonForm<T, R>(client, initial, options)
  const headers = (i = 0) => calls[i]!.init.headers as Record<string, string>
  const body = (i = 0) => JSON.parse(String(calls[i]!.init.body)) as unknown
  return { form, calls, headers, body, onMutate }
}

describe('JsonForm', () => {
  it('submits the fields in JSON mode and keeps the envelope data as result', async () => {
    const { form, headers, body } = setup<{ name: string }, { customer: { id: number } }>(
      { name: 'Initech' },
      () =>
        jsonResponse({ data: { customer: { id: 7 } }, meta: { location: '/customers/7' } }, 201),
      { headers: { Authorization: 'Bearer t' } },
    )
    const onSuccess = vi.fn()

    const outcome = await form.post('/customers', { onSuccess })

    expect(outcome.status).toBe('success')
    expect(headers().Accept).toBe('application/json')
    expect(headers().Authorization).toBe('Bearer t')
    expect(body()).toEqual({ name: 'Initech' })
    expect(form.result).toEqual({ customer: { id: 7 } })
    expect(form.data).toEqual({ name: 'Initech' })
    expect(form.meta.location).toBe('/customers/7')
    expect(form.httpStatus).toBe(201)
    expect(form.wasSuccessful).toBe(true)
    expect(form.recentlySuccessful).toBe(true)
    expect(form.processing).toBe(false)
    expect(onSuccess).toHaveBeenCalledWith({ customer: { id: 7 } }, { location: '/customers/7' })
  })

  it('takes a non-envelope body whole and makes the submitted values the new defaults', async () => {
    const { form } = setup({ name: '' }, () => jsonResponse({ ok: true }))
    form.setData('name', 'Acme')

    await form.put('/profile')

    expect(form.result).toEqual({ ok: true })
    expect(form.isDirty).toBe(false)
  })

  it('resets after success when asked', async () => {
    const { form } = setup({ name: '' }, () => jsonResponse({ data: null }))
    form.setData('name', 'Acme')

    await form.post('/customers', { resetOnSuccess: true })

    expect(form.data.name).toBe('')
  })

  it('maps a 422 to errors and message without touching result', async () => {
    const { form } = setup({ email: '' }, () =>
      jsonResponse(
        { message: 'The email is invalid.', errors: { email: ['Invalid', 'Taken'] } },
        422,
      ),
    )
    form.result = { previous: true }
    const onInvalid = vi.fn()

    const outcome = await form.post('/customers', { onInvalid })

    expect(outcome.status).toBe('invalid')
    expect(form.errors).toEqual({ email: 'Invalid' })
    expect(form.allErrors).toEqual({ email: ['Invalid', 'Taken'] })
    expect(form.message).toBe('The email is invalid.')
    expect(form.httpStatus).toBe(422)
    expect(form.result).toEqual({ previous: true })
    expect(form.wasSuccessful).toBe(false)
    expect(onInvalid).toHaveBeenCalledWith({ email: ['Invalid', 'Taken'] }, 'The email is invalid.')
  })

  it('warns once when a 422 reaches a submission that passed only onError', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { form } = setup({ email: '' }, () =>
      jsonResponse({ message: 'Invalid.', errors: { email: ['Required'] } }, 422),
    )

    await form.post('/customers', { onError: vi.fn() })
    await form.post('/customers', { onError: vi.fn() })
    await form.post('/customers', { onError: vi.fn(), onInvalid: vi.fn() })

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('form.post()')
    warn.mockRestore()
  })

  it('reports other errors, including 419 and 401, without acting on them', async () => {
    let status = 403
    const { form } = setup({ name: '' }, () => jsonResponse({ message: 'Nope.' }, status))
    const onError = vi.fn()

    await form.post('/customers', { onError })
    expect(form.lastError).toMatchObject({ kind: 'forbidden', status: 403, message: 'Nope.' })
    expect(form.message).toBe('Nope.')
    expect(form.httpStatus).toBe(403)
    expect(onError).toHaveBeenCalledOnce()

    status = 419
    await form.post('/customers')
    expect(form.lastError?.kind).toBe('csrf')
    status = 401
    await form.post('/customers')
    expect(form.lastError?.kind).toBe('unauthenticated')
  })

  it('reports a network failure as an exception', async () => {
    const { form } = setup({ name: '' }, () => {
      throw new TypeError('offline')
    })
    const onException = vi.fn()

    const outcome = await form.post('/customers', { onException })

    expect(outcome.status).toBe('exception')
    expect(onException).toHaveBeenCalledOnce()
    expect(form.processing).toBe(false)
  })

  it('sends transformed data and honours onBefore returning false', async () => {
    const { form, calls, body } = setup({ name: 'a', remember: true }, () =>
      jsonResponse({ data: null }),
    )
    form.transform((data) => ({ name: data.name.toUpperCase() }))

    expect(await form.post('/x', { onBefore: () => false })).toEqual({ status: 'cancelled' })
    expect(calls).toHaveLength(0)

    await form.post('/x')
    expect(body()).toEqual({ name: 'A' })
  })

  it('cancels an in-flight submission and lets a newer one supersede it', async () => {
    const pending: Array<(r: Response) => void> = []
    const { form } = setup({ name: '' }, (_url, init) => {
      return new Promise<Response>((resolve, reject) => {
        pending.push(resolve)
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      })
    })
    const events: string[] = []
    const finished: Array<JsonOutcome['status']> = []

    const first = form.post('/a', {
      onCancel: () => events.push('first cancelled'),
      onFinish: (o) => finished.push(o.status),
    })
    expect(form.processing).toBe(true)
    const second = form.post('/b', { onSuccess: () => events.push('second succeeded') })

    expect(await first).toEqual({ status: 'cancelled' })
    pending[1]!(jsonResponse({ data: { id: 2 } }))
    await second
    expect(events).toEqual(['first cancelled', 'second succeeded'])
    expect(finished).toEqual(['cancelled'])
    expect(form.result).toEqual({ id: 2 })

    const third = form.post('/c')
    form.cancel()
    expect(form.processing).toBe(false)
    expect(await third).toEqual({ status: 'cancelled' })
    expect(form.result).toEqual({ id: 2 })
  })

  it('clears the page cache after a submission but not after Precognition', async () => {
    const { form, onMutate } = setup({ email: '' }, (_url, init) =>
      (init.headers as Record<string, string>).Precognition
        ? new Response(null, { status: 204 })
        : jsonResponse({ data: null }),
    )

    await form.validate('post', '/customers', 'email')
    expect(onMutate).not.toHaveBeenCalled()

    await form.post('/customers')
    expect(onMutate).toHaveBeenCalledOnce()
  })

  it('validates through Precognition in JSON mode: 422 scopes errors, 204 clears them', async () => {
    let status = 422
    const { form, headers } = setup({ email: 'bad', name: '' }, () =>
      status === 422
        ? jsonResponse(
            { message: 'Invalid.', errors: { email: ['Invalid email'], name: ['Required'] } },
            422,
          )
        : new Response(null, { status: 204, headers: { 'Precognition-Success': 'true' } }),
    )
    form.setError('name', 'Existing')

    const invalid = await form.validate('post', '/customers', 'email')
    expect(invalid.status).toBe('invalid')
    expect(headers().Precognition).toBe('true')
    expect(headers()['Precognition-Validate-Only']).toBe('email')
    expect(headers().Accept).toBe('application/json')
    expect(form.errors).toEqual({ name: 'Existing', email: 'Invalid email' })
    expect(form.message).toBe('Invalid.')

    status = 204
    const passed = await form.validate('post', '/customers', 'email')
    expect(passed.status).toBe('success')
    expect(form.errors).toEqual({ name: 'Existing' })
    expect(form.validating).toBe(false)
  })

  it('warns when a route does not answer as Precognition', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { form } = setup({ email: '' }, () => jsonResponse({ data: null }))

    expect(await form.validate('post', '/customers')).toEqual({ status: 'cancelled' })
    expect(warn.mock.calls[0]?.[0]).toContain('precognitive')
    warn.mockRestore()
  })
})

/** Minimal XMLHttpRequest double answering JSON, driven by the test. */
class FakeXhr {
  static last: FakeXhr | null = null
  method = ''
  url = ''
  body: unknown = null
  status = 200
  responseText = ''
  responseURL = ''
  withCredentials = false
  upload = {
    listeners: new Map<string, (e: unknown) => void>(),
    addEventListener: (n: string, l: (e: unknown) => void) => void this.upload.listeners.set(n, l),
  }
  private listeners = new Map<string, () => void>()
  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader() {}
  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener)
  }
  getAllResponseHeaders() {
    return 'Content-Type: application/json\r\n'
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {}
  finish(text: string, status = 200) {
    this.status = status
    this.responseText = text
    this.responseURL = 'http://localhost/avatar'
    this.listeners.get('load')?.()
  }
}

describe('JsonForm uploads', () => {
  const original = globalThis.XMLHttpRequest
  afterEach(() => {
    ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = original
  })

  it('sends files as multipart with progress and method spoofing', async () => {
    ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr
    const { form } = setup({ avatar: null as File | null }, () => jsonResponse({}))
    form.setData('avatar', new File(['x'], 'a.png'))
    const onProgress = vi.fn()

    const pending = form.put('/avatar', { onProgress })
    await new Promise((r) => setTimeout(r, 0))
    const xhr = FakeXhr.last!
    xhr.upload.listeners.get('progress')?.({ lengthComputable: true, loaded: 5, total: 10 })
    expect(form.progress?.percentage).toBe(50)
    expect(onProgress).toHaveBeenCalledOnce()

    xhr.finish(JSON.stringify({ data: { url: '/a.png' } }))
    await pending
    expect(xhr.method.toUpperCase()).toBe('POST')
    expect((xhr.body as FormData).get('_method')).toBe('PUT')
    expect(form.result).toEqual({ url: '/a.png' })
    expect(form.progress).toBeNull()
  })
})
