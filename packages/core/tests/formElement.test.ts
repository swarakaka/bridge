import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  fileFieldNames,
  formDataToObject,
  objectToFormData,
  parseFieldName,
  readFormElement,
  writeFormElement,
} from '../src/index.js'
import type { Bridge } from '../src/index.js'
import { bridgeWith, mockFetch, page, pageResponse } from './helpers.js'

describe('parseFieldName', () => {
  it.each([
    ['email', ['email']],
    ['user[name]', ['user', 'name']],
    ['user.name', ['user', 'name']],
    ['tags[]', ['tags', '']],
    ['items[0][name]', ['items', '0', 'name']],
    ['items.0.name', ['items', '0', 'name']],
    ['a[b].c', ['a', 'b', 'c']],
    ['app\\.name', ['app.name']],
  ])('%s', (name, segments) => {
    expect(parseFieldName(name)).toEqual(segments)
  })
})

describe('formDataToObject', () => {
  it('builds nested objects and lists from field names', () => {
    const data = new FormData()
    data.append('name', 'Acme')
    data.append('user.email', 'a@b.c')
    data.append('address[city]', 'Paris')
    data.append('tags[]', 'a')
    data.append('tags[]', 'b')
    data.append('items[0][qty]', '2')
    data.append('items[1][qty]', '3')
    data.append('app\\.name', 'Bridge')
    data.append('dup', '1')
    data.append('dup', '2')

    expect(formDataToObject(data)).toEqual({
      name: 'Acme',
      user: { email: 'a@b.c' },
      address: { city: 'Paris' },
      tags: ['a', 'b'],
      items: [{ qty: '2' }, { qty: '3' }],
      'app.name': 'Bridge',
      dup: '2',
    })
  })

  it('round-trips objectToFormData for strings, lists and nested values', () => {
    const value = { name: 'x', meta: { tags: ['a', 'b'], deep: { n: '1' } }, rows: [{ a: '1' }] }

    expect(formDataToObject(objectToFormData(value))).toEqual(value)
  })

  it('keeps files and turns an empty file input into null', () => {
    const data = new FormData()
    const file = new File(['x'], 'a.png')
    data.append('avatar', file)
    data.append('empty', new File([], ''))

    const out = formDataToObject(data)
    expect(out.avatar).toBeInstanceOf(File)
    expect(out.empty).toBeNull()
  })
})

describe('reading and writing a form element', () => {
  const html = `
    <form>
      <input name="name" value="Acme">
      <input name="user[email]" value="a@b.c">
      <textarea name="notes">Hi</textarea>
      <input type="checkbox" name="remember" value="1">
      <input type="checkbox" name="tags[]" value="a" checked>
      <input type="checkbox" name="tags[]" value="b">
      <input type="radio" name="plan" value="free" checked>
      <input type="radio" name="plan" value="pro">
      <select name="status"><option value="active">A</option><option value="archived" selected>B</option></select>
      <input name="items[][qty]" value="1">
      <input name="items[][qty]" value="2">
      <input type="file" name="avatar">
      <button type="submit" name="go" value="1">Go</button>
    </form>`
  let form: HTMLFormElement
  beforeEach(() => {
    document.body.innerHTML = html
    form = document.querySelector('form')!
  })

  it('reads what a submission would send', () => {
    const values = readFormElement(form)

    expect(values).toMatchObject({
      name: 'Acme',
      user: { email: 'a@b.c' },
      notes: 'Hi',
      tags: ['a'],
      plan: 'free',
      status: 'archived',
      items: [{ qty: '1' }, { qty: '2' }],
      avatar: null,
    })
    expect(values).not.toHaveProperty('remember')
    expect(values).not.toHaveProperty('go')
  })

  it('writes values back by name and reads them again unchanged', () => {
    const next = {
      name: 'Initech',
      user: { email: 'x@y.z' },
      notes: '',
      remember: '1',
      tags: ['b'],
      plan: 'pro',
      status: 'active',
      items: [{ qty: '5' }, { qty: '6' }],
      avatar: null,
    }

    writeFormElement(form, next, 'value')

    expect(readFormElement(form)).toEqual(next)
  })

  it('writes defaults so a native reset restores them', () => {
    const defaults = { ...readFormElement(form), name: 'Globex', tags: ['a', 'b'] }
    writeFormElement(form, defaults, 'default')
    writeFormElement(form, { ...defaults, name: 'typed', tags: [] }, 'value')

    form.reset()

    expect(readFormElement(form)).toMatchObject({ name: 'Globex', tags: ['a', 'b'] })
  })

  it('lists file inputs by top-level name', () => {
    expect(fileFieldNames(form)).toEqual(['avatar'])
  })
})

describe('reset options', () => {
  let bridge: Bridge | null = null
  afterEach(() => bridge?.destroy())

  const invalid = () =>
    pageResponse(
      {
        protocol: 1,
        type: 'error',
        error: { status: 422, kind: 'validation', message: 'x', errors: { password: ['Wrong'] } },
      },
      { status: 422 },
    )

  it('resetOnSuccess with fields resets them to their old defaults before new defaults are set', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ email: '', password: '' })
    form.setData({ email: 'a@b.c', password: 'secret' })

    await form.post('/login', { resetOnSuccess: ['password'] })

    expect(form.data).toEqual({ email: 'a@b.c', password: '' })
    expect(form.defaults).toEqual({ email: 'a@b.c', password: '' })
    expect(form.isDirty).toBe(false)
  })

  it('setDefaultsOnSuccess: false keeps the old defaults', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const form = bridge.form({ email: '' }, { setDefaultsOnSuccess: false })
    form.setData('email', 'a@b.c')

    await form.post('/x')

    expect(form.defaults).toEqual({ email: '' })
    expect(form.isDirty).toBe(true)
  })

  it('resetOnError resets all or the listed fields after a 422', async () => {
    bridge = bridgeWith(mockFetch(invalid))
    const form = bridge.form({ email: '', password: '' })
    form.setData({ email: 'a@b.c', password: 'secret' })

    await form.post('/login', { resetOnError: ['password'], onInvalid: () => undefined })
    expect(form.data).toEqual({ email: 'a@b.c', password: '' })
    expect(form.errors).toEqual({ password: 'Wrong' })

    form.setData('password', 'again')
    await form.post('/login', { resetOnError: true, onInvalid: () => undefined })
    expect(form.data).toEqual({ email: '', password: '' })
  })
})
