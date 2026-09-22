import { CONTROL_EVENT, isControlEvent } from '@swarakaka/bridge-protocol'
import type { BridgeStreamControl } from '@swarakaka/bridge-protocol'
import { Emitter } from '../events/Emitter'
import type { PageStore } from '../pages/PageStore'
import type { Router } from '../router/Router'
import { isSameOrigin, toUrl } from '../router/url'
import { Backoff, type BackoffOptions } from './backoff'
import { SseParser, type SseEvent } from './sseParser'

export type StreamState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface StreamOptions {
  transport?: 'fetch' | 'eventsource' | undefined
  headers?: Record<string, string> | (() => Record<string, string>) | undefined
  withCredentials?: boolean | undefined
  /** Extra channels requested through `?channels=`; the server authorizes them. */
  channels?: string[] | undefined
  backoff?: BackoffOptions | undefined
  /** Multiplier of the server heartbeat interval after which silence triggers a reconnect (fetch only). */
  heartbeatTimeout?: number | undefined
  autoConnect?: boolean | undefined
  /** Apply invalidate/prop/navigate control events to the page (default true). */
  handleControl?: boolean | undefined
  /** Reconnect on `visibilitychange` (visible) and `online` (default true). */
  reconnectOnWake?: boolean | undefined
  fetch?: typeof fetch | undefined
  /** Resolve a URL to connect to (e.g. a signed ticket) before each connection attempt. */
  resolveUrl?: (() => Promise<string> | string) | undefined
}

export interface StreamEvents extends Record<string, unknown> {
  state: StreamState
  open: { replayed: boolean; reconnect: boolean }
  heartbeat: number
  ready: Extract<BridgeStreamControl, { type: 'ready' }>
  invalidate: Extract<BridgeStreamControl, { type: 'invalidate' }>
  prop: Extract<BridgeStreamControl, { type: 'prop' }>
  notification: Extract<BridgeStreamControl, { type: 'notification' }>
  navigate: Extract<BridgeStreamControl, { type: 'navigate' }>
  progress: Extract<BridgeStreamControl, { type: 'progress' }>
  error:
    | Extract<BridgeStreamControl, { type: 'error' }>
    | { type: 'transport'; status?: number | undefined; message: string }
  end: Extract<BridgeStreamControl, { type: 'end' }>
  /** Every application event: { name, data, id }. */
  event: { name: string; data: unknown; id: string | null }
  '*': { name: string; data: unknown; id: string | null; control: boolean }
}

export interface StreamDependencies {
  store: PageStore
  router: Router
  window: Window | null
}

/**
 * SSE client with fetch (default; can send headers) and native EventSource
 * transports, reconnection with backoff and Last-Event-ID, a heartbeat
 * watchdog, and control-event dispatch to the page store/router (PLAN §20.5).
 */
export class StreamClient {
  readonly events = new Emitter<StreamEvents & Record<string, unknown>>()
  private _state: StreamState = 'idle'
  private controller: AbortController | null = null
  private source: EventSource | null = null
  private backoff: Backoff
  private retryMs: number | null = null
  private lastEventId: string | null = null
  private heartbeatMs = 15_000
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private everConnected = false
  private closed = false
  private _lastEventAt: number | null = null
  private _reconnects = 0
  private readonly fetchImpl: typeof fetch
  private readonly onWake = (): void => {
    if (this.closed) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (this._state === 'reconnecting') {
      this.clearReconnect()
      void this.connect()
    }
  }

  constructor(
    private readonly url: string,
    private readonly options: StreamOptions,
    private readonly deps: StreamDependencies,
  ) {
    this.backoff = new Backoff(options.backoff)
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    if (options.reconnectOnWake !== false && deps.window) {
      deps.window.addEventListener('online', this.onWake)
      deps.window.document.addEventListener('visibilitychange', this.onWake)
    }
    if (options.autoConnect !== false) void this.connect()
  }

  get state(): StreamState {
    return this._state
  }

  get lastEventAt(): number | null {
    return this._lastEventAt
  }

  get reconnectAttempts(): number {
    return this._reconnects
  }

  on<K extends keyof StreamEvents>(
    event: K,
    listener: (payload: StreamEvents[K]) => void,
  ): () => void
  on(event: string, listener: (payload: unknown) => void): () => void
  on(event: string, listener: (payload: never) => void): () => void {
    return this.events.on(event, listener as never)
  }

  off(event: string, listener: (payload: never) => void): void {
    this.events.off(event, listener as never)
  }

  async connect(): Promise<void> {
    if (this._state === 'connecting' || this._state === 'open') return
    this.closed = false
    this.setState(this.everConnected ? 'reconnecting' : 'connecting')
    if (this.everConnected) this._reconnects++

    const target = await this.resolveTarget()

    if (this.options.transport === 'eventsource' && typeof EventSource !== 'undefined') {
      this.connectEventSource(target)
      return
    }
    await this.connectFetch(target)
  }

  close(): void {
    this.closed = true
    this.clearReconnect()
    this.stopWatchdog()
    this.controller?.abort()
    this.controller = null
    this.source?.close()
    this.source = null
    if (this.deps.window) {
      this.deps.window.removeEventListener('online', this.onWake)
      this.deps.window.document.removeEventListener('visibilitychange', this.onWake)
    }
    this.setState('closed')
  }

  // ---------------------------------------------------------------------------

  private async resolveTarget(): Promise<string> {
    const base = this.options.resolveUrl ? await this.options.resolveUrl() : this.url
    const url = toUrl(base)
    if (this.options.channels && this.options.channels.length > 0) {
      url.searchParams.set('channels', this.options.channels.join(','))
    }
    return url.href
  }

  private headers(): Record<string, string> {
    const custom =
      typeof this.options.headers === 'function'
        ? this.options.headers()
        : (this.options.headers ?? {})
    const headers: Record<string, string> = { Accept: 'text/event-stream', ...custom }
    if (this.lastEventId) headers['Last-Event-ID'] = this.lastEventId
    return headers
  }

  private async connectFetch(target: string): Promise<void> {
    const controller = new AbortController()
    this.controller = controller
    const parser = new SseParser({
      onEvent: (event) => this.handleEvent(event),
      onComment: () => this.heartbeat(),
      onRetry: (ms) => (this.retryMs = ms),
    })

    let response: Response
    try {
      response = await this.fetchImpl(target, {
        method: 'GET',
        headers: this.headers(),
        credentials: this.options.withCredentials === false ? 'omit' : 'same-origin',
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (error) {
      if (controller.signal.aborted) return
      this.emitTransportError(String((error as Error)?.message ?? error))
      this.scheduleReconnect()
      return
    }

    if (controller.signal.aborted) return

    if (response.status === 401 || response.status === 403) {
      this.emitTransportError(`Stream refused with status ${response.status}`, response.status)
      this.close()
      return
    }

    if (!response.ok || !response.body) {
      this.emitTransportError(`Stream failed with status ${response.status}`, response.status)
      this.scheduleReconnect()
      return
    }

    const reconnect = this.everConnected
    this.everConnected = true
    this.setState('open')
    this.startWatchdog()
    const connectedAt = Date.now()
    this.sawError = false

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        this.touch()
        parser.feed(decoder.decode(value, { stream: true }))
      }
      parser.end()
    } catch (error) {
      if (controller.signal.aborted) return
      this.emitTransportError(String((error as Error)?.message ?? error))
    }

    if (controller.signal.aborted || this.closed) return
    this.stopWatchdog()
    // Server closed. Unless an `end` said otherwise, reconnect with backoff.
    if (this.pendingEnd) {
      const end = this.pendingEnd
      this.pendingEnd = null
      this.lastCloseOrderly = true
      if (!end.reconnect) {
        this.close()
        return
      }
      // Immediate reconnect only after a healthy connection; a short-lived one
      // (throttled, misconfigured) would otherwise loop without pause.
      const healthy = !this.sawError && Date.now() - connectedAt >= 1000
      if (healthy) {
        this.backoff.reset()
        this.setState('reconnecting')
        this._reconnects++
        void this.reconnectNow()
      } else {
        this.scheduleReconnect()
      }
      return
    }
    if (this.finalError) {
      this.close()
      return
    }
    this.scheduleReconnect()
    void reconnect
  }

  private connectEventSource(target: string): void {
    const source = new EventSource(target, {
      withCredentials: this.options.withCredentials !== false,
    })
    this.source = source
    source.onopen = () => {
      this.everConnected = true
      this.setState('open')
      this.backoff.reset()
    }
    source.onerror = () => {
      // The browser reconnects on its own; mirror the state.
      if (source.readyState === EventSource.CLOSED) {
        this.source = null
        if (!this.closed) this.scheduleReconnect()
      } else {
        this.setState('reconnecting')
      }
    }
    source.addEventListener(CONTROL_EVENT, (e) =>
      this.handleEvent({
        event: CONTROL_EVENT,
        data: (e as MessageEvent).data,
        id: (e as MessageEvent).lastEventId || null,
        retry: null,
      }),
    )
    // Application events are unknown ahead of time; route the generic message
    // event and any explicitly listened names. Consumers register names with onApp().
    for (const name of this.appEventNames) {
      source.addEventListener(name, (e) =>
        this.handleEvent({
          event: name,
          data: (e as MessageEvent).data,
          id: (e as MessageEvent).lastEventId || null,
          retry: null,
        }),
      )
    }
  }

  /** Names of application events to listen for with the EventSource transport (fetch needs none). */
  readonly appEventNames = new Set<string>()

  private pendingEnd: Extract<BridgeStreamControl, { type: 'end' }> | null = null
  private finalError = false
  private sawError = false
  /** True when the last connection ended with an `end` control event (nothing was missed). */
  private lastCloseOrderly = false

  private handleEvent(event: SseEvent): void {
    this.touch()
    if (event.id) this.lastEventId = event.id

    let data: unknown = event.data
    try {
      data = JSON.parse(event.data)
    } catch {
      // non-JSON application payloads are passed through as strings
    }

    if (event.event === CONTROL_EVENT) {
      if (!isControlEvent(data)) return
      this.handleControl(data)
      this.events.emit('*', { name: CONTROL_EVENT, data, id: event.id, control: true })
      return
    }

    this.events.emit('event', { name: event.event, data, id: event.id })
    this.events.emit(event.event, data)
    this.events.emit('*', { name: event.event, data, id: event.id, control: false })
  }

  private handleControl(control: BridgeStreamControl): void {
    const apply = this.options.handleControl !== false
    switch (control.type) {
      case 'ready': {
        this.heartbeatMs = control.heartbeat
        this.backoff.reset()
        const reconnect = this._reconnects > 0
        this.events.emit('ready', control)
        this.events.emit('open', { replayed: control.replayed, reconnect })
        if (apply && reconnect && !control.replayed && !this.lastCloseOrderly)
          void this.deps.router.invalidate('*')
        this.lastCloseOrderly = false
        break
      }
      case 'invalidate':
        this.events.emit('invalidate', control)
        if (apply)
          void this.deps.router.invalidate(control.keys === '*' ? '*' : Array.from(control.keys))
        break
      case 'prop':
        this.events.emit('prop', control)
        if (apply) this.deps.store.applyControl(control)
        break
      case 'navigate':
        this.events.emit('navigate', control)
        if (apply && isSameOrigin(control.url))
          void this.deps.router.navigate(control.url, control.replace ?? false)
        break
      case 'notification':
        this.events.emit('notification', control)
        break
      case 'progress':
        this.events.emit('progress', control)
        break
      case 'error':
        this.events.emit('error', control)
        this.sawError = true
        if (control.final) this.finalError = true
        break
      case 'end':
        this.events.emit('end', control)
        this.pendingEnd = control
        break
      default:
        break
    }
  }

  private heartbeat(): void {
    this.touch()
    this.events.emit('heartbeat', Date.now())
  }

  private touch(): void {
    this._lastEventAt = Date.now()
    this.startWatchdog()
  }

  private startWatchdog(): void {
    this.stopWatchdog()
    if (this.options.transport === 'eventsource') return
    const timeout = Math.max(1000, this.heartbeatMs * (this.options.heartbeatTimeout ?? 2.5))
    this.watchdog = setTimeout(() => {
      if (this._state !== 'open') return
      this.emitTransportError('No data received within the heartbeat timeout')
      this.controller?.abort()
      this.controller = null
      this.scheduleReconnect()
    }, timeout)
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    this.stopWatchdog()
    this.setState('reconnecting')
    const delay = this.backoff.next(this.retryMs ?? undefined)
    this.clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this._reconnects++
      void this.reconnectNow()
    }, delay)
  }

  private async reconnectNow(): Promise<void> {
    if (this.closed) return
    this._state = 'reconnecting'
    const target = await this.resolveTarget()
    if (this.options.transport === 'eventsource' && typeof EventSource !== 'undefined') {
      this.connectEventSource(target)
      return
    }
    await this.connectFetch(target)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private emitTransportError(message: string, status?: number): void {
    this.events.emit('error', { type: 'transport', message, status })
  }

  private setState(state: StreamState): void {
    if (this._state === state) return
    this._state = state
    this.events.emit('state', state)
  }
}
