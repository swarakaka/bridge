import type {
  Form,
  FormOptions,
  FormState,
  FormTransport,
  JsonForm,
  JsonFormOptions,
  JsonHandleOptions,
  JsonRequest,
  Method,
  StreamClient,
  StreamOptions,
  StreamState,
} from '@swarakaka/bridge-core'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useBridge, usePageState } from './context.js'

export function usePage<P extends Record<string, unknown> = Record<string, unknown>>(): {
  page: BridgePage | null
  component: string
  url: string
  props: P
} {
  const state = usePageState(useBridge())
  const page = state.page
  return {
    page,
    component: page?.component ?? '',
    url: page?.url ?? '',
    props: (page?.props ?? {}) as P,
  }
}

export function useProp<T = unknown>(key: string, fallback?: T): T {
  const { props } = usePage()
  let cursor: unknown = props
  for (const segment of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return fallback as T
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return (cursor === undefined ? fallback : cursor) as T
}

export function useDeferred<T = unknown>(key: string): { loading: boolean; value: T | undefined } {
  const state = usePageState(useBridge())
  return {
    loading: state.loading.has(key),
    value: (state.page?.props as Record<string, unknown> | undefined)?.[key] as T | undefined,
  }
}

/**
 * Wraps a mutable core object (Form, JsonRequest) so React re-renders on
 * changes: every method call re-renders now (flags such as `processing` flip
 * synchronously) and again when a returned promise settles; property writes
 * re-render too. `refresh()` forces a render after changing nested data.
 * Methods in `quiet` change nothing visible (or are safe to call during
 * render) and do not re-render.
 */
export function useHandle<H extends object>(
  create: () => H,
  quiet: ReadonlySet<PropertyKey> = new Set(),
): H & { refresh(): void } {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const handle = useMemo(create, [])
  const refresh = useCallback(() => rerender(), [])

  return useMemo(() => {
    // A method returning the handle itself (chaining) returns the proxy, so
    // `form.setData(...).post(url)` still re-renders.
    const proxy: H & { refresh(): void } = new Proxy(handle as H & { refresh(): void }, {
      get(target, prop, receiver) {
        if (prop === 'refresh') return refresh
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args)
          if (quiet.has(prop)) return result === target ? proxy : result
          refresh()
          if (result === target) return proxy
          return result instanceof Promise ? result.finally(refresh) : result
        }
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value)
        refresh()
        return true
      },
    })
    return proxy
  }, [handle, refresh])
}

/** Writes a JSON-cloneable value to history state only when it changed. */
function useRememberWriter(key: string | undefined, value: unknown, enabled: boolean): void {
  const bridge = useBridge()
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (!key || !enabled) return
    const serialized = JSON.stringify(value)
    if (serialized === last.current) return
    last.current = serialized
    bridge.router.remember(key, JSON.parse(serialized) as unknown)
  })
}

export interface UseFormOptions extends FormOptions {
  /** Persist the form data in history state under this key (restored on back/forward). */
  remember?: string | undefined
}

/** Form methods that do not re-render: safe to chain during render (`useForm(...).dontRemember('password')`). */
export const QUIET_FORM_METHODS: ReadonlySet<PropertyKey> = new Set([
  'dontRemember',
  'rememberable',
  'touched',
  'valid',
  'invalid',
  'withPrecognition',
  'setValidationTimeout',
  'validateFiles',
  'optimistic',
])

/**
 * A core Form re-rendered on every change. Mutations go through the returned
 * proxy so React sees them (`form.setData('name', v)` or `form.data.name = v` followed by `form.refresh()`).
 * `useForm('key', data)` is `useForm(data, { remember: 'key' })`.
 */
export function useForm<T extends Record<string, unknown>>(
  initial: T,
  options?: UseFormOptions,
): Form<T> & { refresh(): void }
export function useForm<T extends Record<string, unknown>>(
  method: Method,
  url: string | URL,
  initial: T,
  options?: UseFormOptions,
): Form<T> & { refresh(): void }
export function useForm<T extends Record<string, unknown>>(
  rememberKey: string,
  initial: T,
  options?: Omit<UseFormOptions, 'remember'>,
): Form<T> & { refresh(): void }
export function useForm<T extends Record<string, unknown>>(
  first: T | string,
  second?: T | UseFormOptions | string | URL,
  third?: T | Omit<UseFormOptions, 'remember'>,
  fourth?: UseFormOptions,
): Form<T> & { refresh(): void } {
  const [initial, options, endpoint] = formArguments<T, UseFormOptions>(
    first,
    second,
    third,
    fourth,
  )
  const bridge = useBridge()
  const form = useHandle(
    () => withEndpoint(bridge.form(initial, options), endpoint),
    QUIET_FORM_METHODS,
  )
  useFormRemember(form, options.remember)
  return form
}

export interface UseJsonFormOptions extends JsonFormOptions {
  /** Persist the form data in history state under this key (restored on back/forward). */
  remember?: string | undefined
}

/**
 * A form submitted in JSON mode, without navigating: the same routes as page
 * mode with `Accept: application/json`. Field state and methods match
 * `useForm`; the last successful response is `form.result` (with `meta` and
 * `httpStatus`), `form.message` the last error message. An in-flight request
 * is cancelled on unmount.
 */
export function useJsonForm<T extends Record<string, unknown>, R = unknown>(
  initial: T,
  options?: UseJsonFormOptions,
): JsonForm<T, R> & { refresh(): void }
export function useJsonForm<T extends Record<string, unknown>, R = unknown>(
  method: Method,
  url: string | URL,
  initial: T,
  options?: UseJsonFormOptions,
): JsonForm<T, R> & { refresh(): void }
export function useJsonForm<T extends Record<string, unknown>, R = unknown>(
  rememberKey: string,
  initial: T,
  options?: Omit<UseJsonFormOptions, 'remember'>,
): JsonForm<T, R> & { refresh(): void }
export function useJsonForm<T extends Record<string, unknown>, R = unknown>(
  first: T | string,
  second?: T | UseJsonFormOptions | string | URL,
  third?: T | Omit<UseJsonFormOptions, 'remember'>,
  fourth?: UseJsonFormOptions,
): JsonForm<T, R> & { refresh(): void } {
  const [initial, options, endpoint] = formArguments<T, UseJsonFormOptions>(
    first,
    second,
    third,
    fourth,
  )
  const { remember, ...formOptions } = options
  const bridge = useBridge()
  const form = useHandle(
    () => withEndpoint(bridge.jsonForm<T, R>(initial, formOptions), endpoint),
    QUIET_FORM_METHODS,
  )
  useEffect(() => () => form.cancel(), [form])
  useFormRemember(form, remember)
  return form
}

/** Restores after mount and writes on change, leaving out `dontRemember` fields. */
export function useFormRemember<T extends Record<string, unknown>>(
  form: FormState<T, FormTransport>,
  remember: string | undefined,
): void {
  const bridge = useBridge()
  const key = remember ? `form:${remember}` : undefined
  const [restored, setRestored] = useState(false)
  // The data last taken from history (or the data at mount): anything else is the user's.
  // Set at mount, after chained setters such as dontRemember() applied.
  const baseline = useRef('')

  // After mount, so the first client render matches the server markup.
  useEffect(() => {
    if (!key) {
      setRestored(true)
      return
    }
    baseline.current = JSON.stringify(form.rememberable())
    const apply = (value: Partial<T> | undefined): void => {
      if (!value) return
      form.setData(form.rememberable(value))
      baseline.current = JSON.stringify(form.rememberable())
    }
    apply(bridge.router.restore<Partial<T>>(key))
    setRestored(true)
    // Encrypted pages: after a full reload the data arrives once decrypted (PLAN §23.1).
    return bridge.on('restore', ({ values }) => {
      if (key in values && JSON.stringify(form.rememberable()) === baseline.current)
        apply(values[key] as Partial<T>)
    })
  }, [])
  useRememberWriter(key, form.rememberable(), restored)
}

interface FormEndpoint {
  method: Method
  url: string | URL
}

/** Normalises `(data, options)`, `(rememberKey, data, options)` and `(method, url, data, options)`. */
function formArguments<
  T extends Record<string, unknown>,
  O extends { remember?: string | undefined },
>(
  first: unknown,
  second?: unknown,
  third?: unknown,
  fourth?: unknown,
): [T, O, FormEndpoint | null] {
  if (typeof first === 'string' && (typeof second === 'string' || second instanceof URL)) {
    return [third as T, (fourth ?? {}) as O, { method: first as Method, url: second }]
  }
  if (typeof first === 'string') {
    return [second as T, { ...(third as object | undefined), remember: first } as O, null]
  }
  return [first as T, (second ?? {}) as O, null]
}

/** Binds the Precognition endpoint of `useForm(method, url, data)`. */
function withEndpoint<F extends { withPrecognition(method: Method, url: string | URL): F }>(
  form: F,
  endpoint: FormEndpoint | null,
): F {
  return endpoint ? form.withPrecognition(endpoint.method, endpoint.url) : form
}

/** Local state that survives back/forward navigation via history state. */
export function useRemember<T>(
  key: string,
  initial: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const bridge = useBridge()
  const [value, setValue] = useState<T>(initial)
  const [restored, setRestored] = useState(false)
  // The value last taken from history (or the initial one): anything else is the user's.
  const baseline = useRef(JSON.stringify(initial))
  const current = useRef(value)
  current.current = value

  // After mount, so the first client render matches the server markup.
  useEffect(() => {
    const apply = (previous: T | undefined): void => {
      if (previous === undefined) return
      baseline.current = JSON.stringify(previous)
      setValue(previous)
    }
    apply(bridge.router.restore<T>(key))
    setRestored(true)
    // Encrypted pages: after a full reload the value arrives once decrypted (PLAN §23.1).
    return bridge.on('restore', ({ values }) => {
      if (key in values && JSON.stringify(current.current) === baseline.current)
        apply(values[key] as T)
    })
  }, [key])
  useRememberWriter(key, value, restored)

  return [value, setValue]
}

/**
 * JSON mode from a component: the same routes as page mode, requested with
 * `Accept: application/json`, without navigating. `json.data` holds the last
 * envelope's `data`, `json.errors.email` the first validation message. An
 * in-flight request is cancelled on unmount.
 */
export function useJson<T = unknown>(
  options: JsonHandleOptions = {},
): JsonRequest<T> & { refresh(): void } {
  const bridge = useBridge()
  const json = useHandle(() => bridge.jsonRequest<T>(options))
  useEffect(() => () => json.cancel(), [json])
  return json
}

export interface UseStreamReturn {
  state: StreamState
  lastEventAt: number | null
  reconnectAttempts: number
  /** The live client, or null before mount and after unmount. */
  client: StreamClient | null
  /** Listen to an event by name; returns the unsubscribe function. Works before the connection opens. */
  on: (event: string, listener: (payload: unknown) => void) => () => void
  connect: () => Promise<void>
  close: () => void
}

interface Subscription {
  event: string
  listener: (payload: unknown) => void
  off: (() => void) | null
}

/**
 * Opens an SSE stream while the component is mounted and exposes its state.
 * Control events (invalidate, prop, navigate) are applied to the page. The
 * connection starts in an effect, so server rendering never connects and the
 * first client render shows `idle`, like the server markup.
 */
export function useStream(url: string, options: StreamOptions = {}): UseStreamReturn {
  const bridge = useBridge()
  const [state, setState] = useState<StreamState>('idle')
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [client, setClient] = useState<StreamClient | null>(null)
  const clientRef = useRef<StreamClient | null>(null)
  const subscriptions = useRef(new Set<Subscription>())
  const optionsRef = useRef(options)
  optionsRef.current = options
  const channels = (options.channels ?? []).join(',')

  useEffect(() => {
    const { autoConnect, ...streamOptions } = optionsRef.current
    const stream = bridge.stream(url, { ...streamOptions, autoConnect: false })
    clientRef.current = stream
    setClient(stream)

    const offs = [
      stream.on('state', (next) => {
        setState(next)
        setReconnectAttempts(stream.reconnectAttempts)
      }),
      stream.on('*', () => setLastEventAt(stream.lastEventAt)),
      stream.on('heartbeat', () => setLastEventAt(stream.lastEventAt)),
    ]
    for (const subscription of subscriptions.current) {
      stream.appEventNames.add(subscription.event)
      subscription.off = stream.events.on(subscription.event, subscription.listener)
    }
    if (autoConnect !== false) void stream.connect()

    return () => {
      offs.forEach((off) => off())
      for (const subscription of subscriptions.current) {
        subscription.off?.()
        subscription.off = null
      }
      stream.close()
      clientRef.current = null
      setClient(null)
    }
  }, [bridge, url, channels])

  const on = useCallback((event: string, listener: (payload: unknown) => void) => {
    const subscription: Subscription = { event, listener, off: null }
    subscriptions.current.add(subscription)
    const stream = clientRef.current
    if (stream) {
      stream.appEventNames.add(event)
      subscription.off = stream.events.on(event, listener)
    }
    return () => {
      subscription.off?.()
      subscriptions.current.delete(subscription)
    }
  }, [])

  return {
    state,
    lastEventAt,
    reconnectAttempts,
    client,
    on,
    connect: useCallback(() => clientRef.current?.connect() ?? Promise.resolve(), []),
    close: useCallback(() => clientRef.current?.close(), []),
  }
}
