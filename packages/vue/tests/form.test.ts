import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, vModelText, watch, withDirectives } from 'vue'
import { createBridgeApp, useForm } from '../src/index.js'
import type { BridgeApp, ReactiveForm } from '../src/index.js'
import { embed, flush, mockFetch, page, pageResponse } from './helpers.js'

type Fields = { name: string; items: string[] }

let app: BridgeApp | null = null

afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  document.body.innerHTML = ''
})

async function mountForm(
  setup: () => () => ReturnType<typeof h>,
  fetchImpl: typeof fetch = mockFetch(() => pageResponse(page())),
): Promise<BridgeApp> {
  window.history.replaceState(null, '', '/customers/create')
  embed(page({ component: 'Create', url: '/customers/create', props: {} }))
  const Create = defineComponent({ setup })
  app = await createBridgeApp({
    resolve: (name) =>
      name === 'Create'
        ? Create
        : defineComponent({ setup: () => () => h('div', { id: 'other' }) }),
    fetch: fetchImpl,
  })
  return app
}

/** Mounts a page that renders the fields and hands the form back to the test. */
async function withForm(fetchImpl?: typeof fetch): Promise<ReactiveForm<Fields>> {
  let form!: ReactiveForm<Fields>
  await mountForm(() => {
    form = useForm<Fields>({ name: 'Acme', items: ['a'] })
    return () =>
      h('div', [
        h('span', { id: 'name' }, form.name),
        h('span', { id: 'items' }, form.items.join(',')),
        h('span', { id: 'dirty' }, String(form.isDirty)),
      ])
  }, fetchImpl)
  return form
}

const text = (id: string): string | null | undefined => document.getElementById(id)?.textContent

describe('useForm flat field access', () => {
  it('reads and writes fields at the top level and through form.data', async () => {
    const form = await withForm()

    expect(form.name).toBe('Acme')
    expect(form.data.name).toBe('Acme')

    form.name = 'Initech'
    expect(form.data.name).toBe('Initech')
    await nextTick()
    expect(text('name')).toBe('Initech')

    form.data.name = 'Globex'
    expect(form.name).toBe('Globex')
    await nextTick()
    expect(text('name')).toBe('Globex')
  })

  it('keeps members reachable and consistent with in, Object.keys and descriptors', async () => {
    const form = await withForm()

    expect('name' in form).toBe(true)
    expect('post' in form).toBe(true)
    expect('missing' in form).toBe(false)
    expect(Object.keys(form)).toEqual(expect.arrayContaining(['data', 'errors', 'name', 'items']))
    expect(Object.getOwnPropertyDescriptor(form, 'name')).toMatchObject({
      value: 'Acme',
      enumerable: true,
    })
    expect(form.post).toBe(form.post)
    expect(form.setData({ name: 'Chained' }).name).toBe('Chained')
  })

  it('replaces a whole array and re-renders', async () => {
    const form = await withForm()

    form.items = [...form.items, 'b']
    await nextTick()

    expect(form.data.items).toEqual(['a', 'b'])
    expect(text('items')).toBe('a,b')
  })

  it('tracks flat reads in watchers', async () => {
    const form = await withForm()
    const seen: string[] = []
    watch(
      () => form.name,
      (value) => seen.push(value),
    )

    form.name = 'Initech'
    await nextTick()
    form.reset()
    await nextTick()

    expect(seen).toEqual(['Initech', 'Acme'])
  })

  it('reports isDirty after a flat write and reset() restores the flat value', async () => {
    const form = await withForm()

    form.name = 'Initech'
    await nextTick()
    expect(form.isDirty).toBe(true)
    expect(text('dirty')).toBe('true')

    form.reset()
    await nextTick()
    expect(form.name).toBe('Acme')
    expect(form.isDirty).toBe(false)
    expect(text('name')).toBe('Acme')
  })

  it('submits values written through flat fields', async () => {
    const bodies: unknown[] = []
    const fetch = mockFetch((_url, init) => {
      bodies.push(JSON.parse(String(init.body)))
      return pageResponse(page())
    })
    const form = await withForm(fetch)

    form.name = 'Initech'
    form.items = ['x', 'y']
    await form.post('/customers')

    expect(bodies).toEqual([{ name: 'Initech', items: ['x', 'y'] }])
  })

  it('binds v-model to a flat field', async () => {
    let form!: ReactiveForm<{ name: string }>
    await mountForm(() => {
      form = useForm({ name: '' })
      return () =>
        h('div', [
          withDirectives(
            h('input', {
              id: 'input',
              'onUpdate:modelValue': (value: string) => (form.name = value),
            }),
            [[vModelText, form.name]],
          ),
          h('span', { id: 'name' }, form.name),
        ])
    })
    const input = document.getElementById('input') as HTMLInputElement

    input.value = 'Initech'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(form.data.name).toBe('Initech')
    expect(text('name')).toBe('Initech')

    form.name = 'Globex'
    await nextTick()
    expect(input.value).toBe('Globex')
  })

  it('round-trips remembered values written through flat fields', async () => {
    await mountForm(
      () => {
        const form = useForm({ name: '' }, { remember: 'flat' })
        return () =>
          h('div', [
            h('span', { id: 'name' }, form.name),
            h('button', { id: 'fill', onClick: () => (form.name = 'Initech') }),
          ])
      },
      mockFetch(() => pageResponse(page({ component: 'Other', url: '/other', props: {} }))),
    )

    document.getElementById('fill')!.click()
    await flush()
    await app!.bridge.router.visit('/other')
    await flush()
    expect(document.getElementById('other')).not.toBeNull()

    window.history.back()
    await flush()
    await flush()
    expect(text('name')).toBe('Initech')
  })

  it('takes the remember key first and keeps dontRemember fields out of history', async () => {
    await mountForm(
      () => {
        const form = useForm('login', { email: '', password: '' }).dontRemember('password')
        return () =>
          h('div', [
            h('span', { id: 'email' }, form.email),
            h('span', { id: 'password' }, form.password),
            h('button', {
              id: 'fill',
              onClick: () => {
                form.email = 'ada@example.com'
                form.password = 'secret'
              },
            }),
          ])
      },
      mockFetch(() => pageResponse(page({ component: 'Other', url: '/other', props: {} }))),
    )

    document.getElementById('fill')!.click()
    await flush()
    expect(JSON.stringify(window.history.state)).toContain('ada@example.com')
    expect(JSON.stringify(window.history.state)).not.toContain('secret')
    await app!.bridge.router.visit('/other')
    await flush()

    window.history.back()
    await flush()
    await flush()
    expect(text('email')).toBe('ada@example.com')
    expect(text('password')).toBe('')
  })

  it('resets and clears errors through resetAndClearErrors', async () => {
    const form = await withForm()
    form.name = 'Initech'
    form.setError('name', 'Taken')

    form.resetAndClearErrors('name')

    expect(form.name).toBe('Acme')
    expect(form.errors).toEqual({})
  })

  it.each(['errors', 'processing', 'data', 'reset', 'transform', 'progress', 'options'])(
    'refuses a field named %s',
    async (field) => {
      let error: unknown
      await mountForm(() => {
        try {
          useForm({ [field]: '' })
        } catch (e) {
          error = e
        }
        return () => h('div')
      })

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(`"${field}"`)
      expect((error as Error).message).toContain('Rename the field')
    },
  )
})
