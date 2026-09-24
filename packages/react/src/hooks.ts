import type {
  Form,
  FormOptions,
  JsonHandleOptions,
  JsonRequest,
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
function useHandle<H extends object>(
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
const QUIET_FORM_METHODS: ReadonlySet<PropertyKey> = new Set(['dontRemember', 'rememberable'])

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
  rememberKey: string,
  initial: T,
  options?: Omit<UseFormOptions, 'remember'>,
): Form<T> & { refresh(): void }
export function useForm<T extends Record<string, unknown>>(
  first: T | string,
  second?: T | UseFormOptions,
  third?: Omit<UseFormOptions, 'remember'>,
): Form<T> & { refresh(): void } {
  const [initial, options] = formArguments<T>(first, second, third)
  const bridge = useBridge()
  const form = useHandle(() => bridge.form(initial, options), QUIET_FORM_METHODS)
  const key = options.remember ? `form:${options.remember}` : undefined
  const [restored, setRestored] = useState(false)

  // After mount, so the first client render matches the server markup.
  useEffect(() => {
    if (key) {
      const value = bridge.router.restore<Partial<T>>(key)
      if (value) form.setData(form.rememberable(value))
    }
    setRestored(true)
  }, [])
  useRememberWriter(key, form.rememberable(), restored)

  return form
}

/** Normalises `(data, options)` and `(rememberKey, data, options)`. */
function formArguments<T extends Record<string, unknown>>(
  first: T | string,
  second?: T | UseFormOptions,
  third?: Omit<UseFormOptions, 'remember'>,
): [T, UseFormOptions] {
  if (typeof first === 'string') return [second as T, { ...third, remember: first }]
  return [first, (second as UseFormOptions | undefined) ?? {}]
}

/** Local state that survives back/forward navigation via history state. */
export function useRemember<T>(
  key: string,
  initial: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const bridge = useBridge()
  const [value, setValue] = useState<T>(initial)
  const [restored, setRestored] = useState(false)

  // After mount, so the first client render matches the server markup.
  useEffect(() => {
    const previous = bridge.router.restore<T>(key)
    if (previous !== undefined) setValue(previous)
    setRestored(true)
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
