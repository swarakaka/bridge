import { describe, expect, it, vi } from 'vitest'
import { RequestManager, JsonClient, kindFor, JsonRequest } from '../src/index.js'

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function client(handler: Handler) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return handler(url, init ?? {})
  }) as unknown as typeof fetch
  const http = new RequestManager({ fetch: fetchImpl, xsrfCookie: () => 'token' })
  return { json: new JsonClient(http), fetch: fetchImpl }
}

describe('JsonClient', () => {
  it('sends Accept: application/json and unwraps the envelope', async () => {
    const { json, fetch } = client(() =>
      jsonResponse({ data: { customers: [{ id: 1 }] }, meta: { total: 1 } }),
    )
    const outcome = await json.get<{ customers: Array<{ id: number }> }>('/customers', {
      data: { search: 'acme' },
      only: ['customers'],
    })
    expect(outcome.status).toBe('success')
    if (outcome.status !== 'success') return
    expect(outcome.data?.customers[0]?.id).toBe(1)
    expect(outcome.meta).toEqual({ total: 1 })
    expect(outcome.envelope).toBe(true)
    expect(outcome.location).toBeNull()

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Accept).toBe('application/json')
    expect(headers['X-Bridge-Only']).toBe('customers')
    expect(headers['X-Bridge-Build']).toBeUndefined()
    expect(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain('search=acme')
  })

  it('posts JSON with the XSRF token and reads meta.location on 201', async () => {
    const { json, fetch } = client(() =>
      jsonResponse(
        {
          data: { customer: { id: 23 } },
          meta: { location: '/customers/23', flash: { message: 'ok' } },
        },
        201,
        { Location: '/customers/23' },
      ),
    )
    const outcome = await json.post('/customers', { data: { name: 'Initech' } })
    expect(outcome.status).toBe('success')
    if (outcome.status !== 'success') return
    expect(outcome.httpStatus).toBe(201)
    expect(outcome.location).toBe('/customers/23')
    expect(outcome.meta.flash).toEqual({ message: 'ok' })

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['X-XSRF-TOKEN']).toBe('token')
    expect(headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"name":"Initech"}')
  })

  it('returns non-envelope JSON as data unchanged', async () => {
    const { json } = client(() => jsonResponse([1, 2, 3]))
    const outcome = await json.get<number[]>('/plain')
    expect(outcome.status).toBe('success')
    if (outcome.status !== 'success') return
    expect(outcome.data).toEqual([1, 2, 3])
    expect(outcome.envelope).toBe(false)
  })

  it('treats 204 as success with null data', async () => {
    const { json } = client(() => new Response(null, { status: 204 }))
    const outcome = await json.delete('/customers/1')
    expect(outcome).toMatchObject({ status: 'success', data: null, httpStatus: 204 })
  })

  it('maps 422 to invalid with Laravel-native errors', async () => {
    const { json } = client(() =>
      jsonResponse(
        {
          message: 'The email field is required.',
          errors: { email: ['The email field is required.'] },
        },
        422,
      ),
    )
    const outcome = await json.post('/customers', { data: {} })
    expect(outcome).toEqual({
      status: 'invalid',
      httpStatus: 422,
      message: 'The email field is required.',
      errors: { email: ['The email field is required.'] },
    })
  })

  it('maps other statuses to error kinds and reads Retry-After', async () => {
    const { json } = client(() =>
      jsonResponse({ message: 'Too Many Attempts.' }, 429, { 'Retry-After': '7' }),
    )
    const outcome = await json.get('/customers')
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') return
    expect(outcome.error).toMatchObject({
      kind: 'throttled',
      status: 429,
      message: 'Too Many Attempts.',
      retryAfter: 7,
    })
    expect(outcome.error.body).toEqual({ message: 'Too Many Attempts.' })
  })

  it('flags non-JSON bodies as invalid', async () => {
    const { json } = client(
      () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )
    const outcome = await json.get('/login')
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') return
    expect(outcome.error.kind).toBe('invalid')
    expect(outcome.httpStatus).toBe(200)

    const { json: json500 } = client(
      () => new Response('boom', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    )
    const failed = await json500.get('/x')
    expect(failed.status === 'error' && failed.error.kind).toBe('invalid')
  })

  it('reports network failures as exceptions and aborts as cancelled', async () => {
    const { json } = client(() => {
      throw new TypeError('Failed to fetch')
    })
    expect((await json.get('/x')).status).toBe('exception')

    const controller = new AbortController()
    const { json: aborting } = client(() => {
      controller.abort()
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    })
    expect((await aborting.get('/x', { signal: controller.signal })).status).toBe('cancelled')
  })

  it('derives kinds from status', () => {
    expect(kindFor(401)).toBe('unauthenticated')
    expect(kindFor(403)).toBe('forbidden')
    expect(kindFor(404)).toBe('not_found')
    expect(kindFor(409)).toBe('conflict')
    expect(kindFor(419)).toBe('csrf')
    expect(kindFor(429)).toBe('throttled')
    expect(kindFor(503)).toBe('server')
    expect(kindFor(418)).toBe('http')
  })
})

describe('JsonRequest', () => {
  it('tracks processing, data and errors across calls', async () => {
    let call = 0
    const { json } = client(() => {
      call += 1
      if (call === 1)
        return jsonResponse(
          { message: 'Invalid.', errors: { name: ['Required.', 'Too short.'] } },
          422,
        )
      return jsonResponse(
        { data: { customer: { id: 5 } }, meta: { location: '/customers/5' } },
        201,
      )
    })
    const request = new JsonRequest<{ customer: { id: number } }>(json, {
      headers: { Authorization: 'Bearer t' },
    })

    const onInvalid = vi.fn()
    const pending = request.post('/customers', { data: { name: '' }, onInvalid })
    expect(request.processing).toBe(true)
    await pending
    expect(request.processing).toBe(false)
    expect(request.httpStatus).toBe(422)
    expect(request.errors).toEqual({ name: 'Required.' })
    expect(request.allErrors).toEqual({ name: ['Required.', 'Too short.'] })
    expect(request.hasErrors).toBe(true)
    expect(request.message).toBe('Invalid.')
    expect(onInvalid).toHaveBeenCalledWith({ name: ['Required.', 'Too short.'] }, 'Invalid.')

    const onSuccess = vi.fn()
    await request.post('/customers', { data: { name: 'Acme' }, onSuccess })
    expect(request.hasErrors).toBe(false)
    expect(request.data).toEqual({ customer: { id: 5 } })
    expect(request.meta.location).toBe('/customers/5')
    expect(request.httpStatus).toBe(201)
    expect(request.wasSuccessful).toBe(true)
    expect(onSuccess).toHaveBeenCalledWith({ customer: { id: 5 } }, { location: '/customers/5' })
  })

  it('records errors and resets', async () => {
    const { json } = client(() => jsonResponse({ message: 'Unauthenticated.' }, 401))
    const request = new JsonRequest(json)
    const onError = vi.fn()
    await request.get('/customers', { onError })
    expect(request.lastError?.kind).toBe('unauthenticated')
    expect(request.message).toBe('Unauthenticated.')
    expect(onError).toHaveBeenCalled()

    request.reset()
    expect(request.lastError).toBeNull()
    expect(request.httpStatus).toBeNull()
    expect(request.data).toBeNull()
  })

  it('cancels the previous in-flight request when a new one starts', async () => {
    const resolvers: Array<(r: Response) => void> = []
    const { json } = client(
      (_, init) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
          resolvers.push(resolve)
        }),
    )
    const request = new JsonRequest<{ n: number }>(json)
    const first = request.get('/a')
    const second = request.get('/b')
    expect(await first).toEqual({ status: 'cancelled' })
    resolvers[1]?.(jsonResponse({ data: { n: 2 } }))
    expect((await second).status).toBe('success')
    expect(request.data).toEqual({ n: 2 })
    expect(request.processing).toBe(false)

    const third = request.get('/c')
    request.cancel()
    expect(request.processing).toBe(false)
    expect((await third).status).toBe('cancelled')
  })
})
