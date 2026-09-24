import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { BridgeForm, createBridgeApp, useFormContext } from '../src/index.js'
import type { BridgeApp, BridgeFormInstance } from '../src/index.js'
import { embed, flush, mockFetch, page, pageResponse } from './helpers.js'

let app: BridgeApp | null = null
afterEach(() => {
  app?.bridge.destroy()
  app?.app?.unmount()
  app = null
  document.body.innerHTML = ''
})

type Calls = { mock: { calls: Array<[string, RequestInit]> } }

async function mountPage(
  render: () => ReturnType<typeof h>,
  fetchImpl: typeof fetch = mockFetch(() =>
    pageResponse(page({ component: 'Login', url: '/login', props: {} })),
  ),
): Promise<BridgeApp> {
  window.history.replaceState(null, '', '/login')
  embed(page({ component: 'Login', url: '/login', props: {} }))
  const Login = defineComponent({ setup: () => render })
  app = await createBridgeApp({
    resolve: (name) =>
      name === 'Login' ? Login : defineComponent({ setup: () => () => h('div', { id: 'other' }) }),
    fetch: fetchImpl,
  })
  await nextTick()
  return app
}

const input = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
const text = (id: string) => document.getElementById(id)?.textContent
function type(name: string, value: string): void {
  input(name).value = value
  input(name).dispatchEvent(new Event('input', { bubbles: true }))
}

const invalid = (errors: Record<string, string[]>) =>
  pageResponse(
    {
      protocol: 1,
      type: 'error',
      error: { status: 422, kind: 'validation', message: 'x', errors },
    },
    422,
  )

/** Email and password inputs, error and state spans, from the slot's form. */
function fields(form: BridgeFormInstance) {
  return [
    h('input', { name: 'email', value: 'ada@example.com' }),
    h('input', { name: 'password', type: 'password' }),
    h('input', { name: 'remember', type: 'checkbox', value: '1' }),
    h('p', { id: 'error' }, form.errors.email ?? ''),
    h('span', { id: 'dirty' }, String(form.isDirty)),
    h('span', { id: 'processing' }, String(form.processing)),
    h('button', { id: 'reset', type: 'button', onClick: () => form.reset() }),
  ]
}

describe('BridgeForm', () => {
  it('reads values from the markup, tracks typing and submits them to the action', async () => {
    const fetch = mockFetch(() =>
      pageResponse(page({ component: 'Login', url: '/login', props: {} })),
    )
    const success = vi.fn()
    await mountPage(
      () => h(BridgeForm, { action: '/login', onSuccess: success }, { default: fields }),
      fetch,
    )
    expect(text('dirty')).toBe('false')

    type('password', 'secret')
    input('remember').checked = true
    input('remember').dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(text('dirty')).toBe('true')

    document.querySelector('form')!.requestSubmit()
    await flush()

    const [url, init] = (fetch as unknown as Calls).mock.calls.at(-1)!
    expect(String(url)).toContain('/login')
    expect(init.method?.toUpperCase()).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'ada@example.com',
      password: 'secret',
      remember: '1',
    })
    expect(success).toHaveBeenCalledOnce()
    expect(text('dirty')).toBe('false')
  })

  it('renders server errors in the slot and reset() writes the defaults back to the fields', async () => {
    await mountPage(
      () => h(BridgeForm, { action: '/login' }, { default: fields }),
      mockFetch(() => invalid({ email: ['These credentials do not match.'] })),
    )
    type('email', 'wrong@example.com')

    document.querySelector('form')!.requestSubmit()
    await flush()
    expect(text('error')).toBe('These credentials do not match.')

    document.getElementById('reset')!.click()
    await nextTick()
    expect(input('email').value).toBe('ada@example.com')
    expect(text('dirty')).toBe('false')
  })

  it('resetOnSuccess and resetOnError reset the listed fields in the DOM', async () => {
    let fail = true
    await mountPage(
      () =>
        h(
          BridgeForm,
          {
            action: '/login',
            resetOnSuccess: ['password'],
            resetOnError: ['password'],
            options: { preserveState: true },
          },
          { default: fields },
        ),
      mockFetch(() =>
        fail
          ? invalid({ password: ['Wrong'] })
          : pageResponse(page({ component: 'Login', url: '/login', props: {} })),
      ),
    )

    type('password', 'bad')
    document.querySelector('form')!.requestSubmit()
    await flush()
    expect(input('password').value).toBe('')

    fail = false
    type('email', 'grace@example.com')
    type('password', 'good')
    document.querySelector('form')!.requestSubmit()
    await flush()
    expect(input('password').value).toBe('')
    expect(input('email').value).toBe('grace@example.com')

    // The submitted email is the new default: a native reset agrees with form.reset().
    type('email', 'someone@else.com')
    document.querySelector('form')!.reset()
    expect(input('email').value).toBe('grace@example.com')
  })

  it('is inert while processing when disableWhileProcessing is set', async () => {
    let release: (r: Response) => void = () => undefined
    await mountPage(
      () => h(BridgeForm, { action: '/login', disableWhileProcessing: true }, { default: fields }),
      mockFetch(() => new Promise<Response>((resolve) => (release = resolve))),
    )

    document.querySelector('form')!.requestSubmit()
    await nextTick()
    expect(document.querySelector('form')!.hasAttribute('inert')).toBe(true)

    release(pageResponse(page({ component: 'Login', url: '/login', props: {} })))
    await flush()
    expect(document.querySelector('form')!.hasAttribute('inert')).toBe(false)
  })

  it('submits in JSON mode with `json` and exposes the result', async () => {
    const fetch = mockFetch(
      () =>
        new Response(JSON.stringify({ data: { token: 'abc' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    await mountPage(
      () =>
        h(
          BridgeForm,
          { action: '/tokens', json: true },
          {
            default: (form: BridgeFormInstance) => [
              h('input', { name: 'name', value: 'ci' }),
              h('span', { id: 'token' }, String((form.result as { token?: string })?.token ?? '')),
            ],
          },
        ),
      fetch,
    )

    document.querySelector('form')!.requestSubmit()
    await flush()

    const [, init] = (fetch as unknown as Calls).mock.calls.at(-1)!
    expect((init.headers as Record<string, string>).Accept).toBe('application/json')
    expect(text('token')).toBe('abc')
    expect(window.location.pathname).toBe('/login')
  })

  it('gives nested components the form through useFormContext, and null outside', async () => {
    const seen: Array<BridgeFormInstance | null> = []
    const Child = defineComponent({
      setup() {
        const form = useFormContext()
        seen.push(form)
        return () => h('span', { id: 'child' }, String(form?.isDirty))
      },
    })
    await mountPage(() =>
      h('div', [
        h(
          BridgeForm,
          { action: '/login' },
          { default: () => [h('input', { name: 'email' }), h(Child)] },
        ),
        h(Child),
      ]),
    )

    expect(seen[0]).not.toBeNull()
    expect(seen[1]).toBeNull()
    type('email', 'x')
    await nextTick()
    expect(text('child')).toBe('true')
  })

  it('exposes the form through a template ref and validates against the action', async () => {
    const formRef = ref<BridgeFormInstance | null>(null)
    const fetch = mockFetch((_url, init) =>
      (init.headers as Record<string, string>).Precognition
        ? invalid({ email: ['Invalid'] })
        : pageResponse(page({ component: 'Login', url: '/login', props: {} })),
    )
    await mountPage(
      () =>
        h(
          BridgeForm,
          { action: '/login', ref: formRef, validationTimeout: 0 },
          { default: fields },
        ),
      fetch,
    )

    type('email', 'bad')
    await nextTick()
    expect(formRef.value!.isDirty).toBe(true)
    await formRef.value!.validate('email')
    await nextTick()

    const [, init] = (fetch as unknown as Calls).mock.calls.at(-1)!
    expect((init.headers as Record<string, string>)['Precognition-Validate-Only']).toBe('email')
    expect(formRef.value!.invalid('email')).toBe(true)
    expect(text('error')).toBe('Invalid')
  })

  it('cancels an in-flight submission when it unmounts', async () => {
    let aborted = false
    const show = ref(true)
    await mountPage(
      () => (show.value ? h(BridgeForm, { action: '/login' }, { default: fields }) : h('div')),
      mockFetch(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              aborted = true
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            })
          }),
      ),
    )

    document.querySelector('form')!.requestSubmit()
    await flush()
    show.value = false
    await flush()

    expect(aborted).toBe(true)
  })
})
