import type { StreamClient, StreamEvents, StreamOptions, StreamState } from '@swarakaka/bridge-core'
import {
  getCurrentInstance,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  type Ref,
  type ShallowRef,
} from 'vue'
import { useBridge } from '../injection.js'

export interface UseStreamOptions extends StreamOptions {
  /** Close the stream when the component scope is disposed (default true). */
  closeOnDispose?: boolean | undefined
}

export interface UseStreamReturn {
  client: ShallowRef<StreamClient>
  state: Ref<StreamState>
  lastEventAt: Ref<number | null>
  reconnectAttempts: Ref<number>
  on: StreamClient['on']
  connect: () => Promise<void>
  close: () => void
}

/**
 * Opens an SSE stream and exposes its state reactively. Control events
 * (invalidate, prop, navigate) are applied to the page automatically.
 */
export function useStream(url: string, options: UseStreamOptions = {}): UseStreamReturn {
  const bridge = useBridge()
  const { closeOnDispose, ...streamOptions } = options
  // Never connect while rendering on the server. In a component, connect once
  // mounted so the first client render shows the same state as the server
  // markup ('idle') and hydration matches.
  const server = typeof window === 'undefined'
  const instance = getCurrentInstance()
  const autoConnect = streamOptions.autoConnect !== false && !server
  const stream = bridge.stream(url, {
    ...streamOptions,
    autoConnect: autoConnect && !instance,
  })
  if (autoConnect && instance) onMounted(() => void stream.connect())

  const state = ref<StreamState>(stream.state)
  const lastEventAt = ref<number | null>(stream.lastEventAt)
  const reconnectAttempts = ref(stream.reconnectAttempts)

  stream.on('state', (s) => {
    state.value = s
    reconnectAttempts.value = stream.reconnectAttempts
  })
  stream.on('*', () => {
    lastEventAt.value = stream.lastEventAt
  })
  stream.on('heartbeat', () => {
    lastEventAt.value = stream.lastEventAt
  })

  if (closeOnDispose !== false && getCurrentScope()) {
    onScopeDispose(() => stream.close())
  }

  const on: StreamClient['on'] = ((event: string, listener: (payload: unknown) => void) => {
    stream.appEventNames.add(event)
    return stream.events.on(event, listener)
  }) as StreamClient['on']

  return {
    client: shallowRef(stream),
    state,
    lastEventAt,
    reconnectAttempts,
    on,
    connect: () => stream.connect(),
    close: () => stream.close(),
  }
}

export type { StreamEvents }
