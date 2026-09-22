import { describe, expect, it } from 'vitest'
import { RequestManager } from '../src/http/RequestManager.js'
import { hasFiles, objectToFormData } from '../src/http/formData.js'
import { readXsrfToken } from '../src/http/csrf.js'

describe('formData', () => {
  it('detects files at any depth', () => {
    const file = new File(['x'], 'x.txt')
    expect(hasFiles({ a: 1 })).toBe(false)
    expect(hasFiles({ a: { b: [file] } })).toBe(true)
    expect(hasFiles(file)).toBe(true)
  })

  it('flattens nested data with bracket notation', () => {
    const form = objectToFormData({
      name: 'a',
      tags: ['x', 'y'],
      meta: { k: 'v', on: true, off: false },
      none: null,
      empty: [],
    })
    expect(form.get('name')).toBe('a')
    expect(form.get('tags[0]')).toBe('x')
    expect(form.get('tags[1]')).toBe('y')
    expect(form.get('meta[k]')).toBe('v')
    expect(form.get('meta[on]')).toBe('1')
    expect(form.get('meta[off]')).toBe('0')
    expect(form.get('none')).toBe('')
    expect(form.get('empty[]')).toBe('')
  })
})

describe('csrf', () => {
  it('reads and decodes the XSRF-TOKEN cookie', () => {
    expect(readXsrfToken('a=1; XSRF-TOKEN=abc%3D%3D; b=2')).toBe('abc==')
    expect(readXsrfToken('a=1')).toBeNull()
  })
})

describe('RequestManager.prepare', () => {
  const manager = new RequestManager({ xsrfCookie: () => 'token' })

  it('builds GET requests with query data and bridge headers', () => {
    const prepared = manager.prepare({
      method: 'get',
      url: '/customers',
      data: { search: 'acme', page: 2 },
      only: ['customers', 'stats'],
      component: 'Customers/Index',
      build: 'b1',
      prefetch: true,
    })
    expect(prepared.method).toBe('GET')
    expect(prepared.url.search).toBe('?search=acme&page=2')
    expect(prepared.headers).toMatchObject({
      Accept: 'application/vnd.bridge+json; v=1',
      'X-Bridge-Only': 'customers,stats',
      'X-Bridge-Component': 'Customers/Index',
      'X-Bridge-Build': 'b1',
      Purpose: 'prefetch',
    })
    expect(prepared.body).toBeNull()
    expect(prepared.headers['X-XSRF-TOKEN']).toBeUndefined()
  })

  it('sends JSON bodies with the CSRF header for mutations', () => {
    const prepared = manager.prepare({ method: 'post', url: '/customers', data: { name: 'a' } })
    expect(prepared.method).toBe('POST')
    expect(prepared.headers['Content-Type']).toBe('application/json')
    expect(prepared.headers['X-XSRF-TOKEN']).toBe('token')
    expect(prepared.body).toBe('{"name":"a"}')
  })

  it('switches to multipart with method spoofing when files are present', () => {
    const prepared = manager.prepare({
      method: 'put',
      url: '/customers/1',
      data: { avatar: new File(['x'], 'a.png') },
    })
    expect(prepared.method).toBe('POST')
    expect(prepared.multipart).toBe(true)
    expect(prepared.body).toBeInstanceOf(FormData)
    expect((prepared.body as FormData).get('_method')).toBe('PUT')
    expect(prepared.headers['Content-Type']).toBeUndefined()
  })

  it('omits the component header without partial selection', () => {
    const prepared = manager.prepare({ method: 'get', url: '/x', component: 'X' })
    expect(prepared.headers['X-Bridge-Component']).toBeUndefined()
  })
})
