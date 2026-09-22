import { describe, expect, it } from 'vitest'
import { parseResponse } from '../src/http/responseParser'
import { page, pageResponse } from './helpers'

const wrap = (response: Response, url = 'http://localhost/customers') => ({
  status: response.status,
  headers: response.headers,
  url,
  text: () => response.text(),
})

describe('parseResponse', () => {
  it('parses page objects', async () => {
    const parsed = await parseResponse(wrap(pageResponse(page())))
    expect(parsed.kind).toBe('page')
    if (parsed.kind === 'page') expect(parsed.page.component).toBe('Customers/Index')
  })

  it('parses error objects', async () => {
    const body = {
      protocol: 1,
      type: 'error',
      error: { status: 422, kind: 'validation', message: 'x', errors: { email: ['req'] } },
    }
    const parsed = await parseResponse(wrap(pageResponse(body, { status: 422 })))
    expect(parsed).toMatchObject({ kind: 'error', status: 422, error: { kind: 'validation' } })
  })

  it('detects build conflicts and unsupported versions', async () => {
    const conflict = new Response('', {
      status: 409,
      headers: { 'X-Bridge-Location': '/customers' },
    })
    expect(await parseResponse(wrap(conflict))).toEqual({
      kind: 'conflict',
      location: '/customers',
    })
    const unsupported = new Response('{}', {
      status: 406,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(await parseResponse(wrap(unsupported))).toEqual({ kind: 'unsupported', status: 406 })
  })

  it('flags non-bridge responses', async () => {
    const html = new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    const parsed = await parseResponse(wrap(html))
    expect(parsed).toMatchObject({ kind: 'invalid', contentType: 'text/html', body: '<html>' })

    const badJson = new Response('{oops', {
      status: 200,
      headers: { 'Content-Type': 'application/vnd.bridge+json; v=1' },
    })
    expect((await parseResponse(wrap(badJson))).kind).toBe('invalid')
  })
})
