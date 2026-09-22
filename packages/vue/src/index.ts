/**
 * @swarakaka/bridge-vue — Vue 3 bindings for Bridge (PLAN §10.3).
 */
export { createBridgeApp } from './createBridgeApp'
export type {
  CreateBridgeAppOptions,
  BridgeApp,
  ComponentResolver,
  ErrorPageProps,
} from './createBridgeApp'
export { createBridgePlugin } from './plugin'
export { BridgeKey, useBridge } from './injection'
export { usePage, useProp, useDeferred } from './composables/usePage'
export type { PageRef } from './composables/usePage'
export { useForm } from './composables/useForm'
export type { ReactiveForm, UseFormOptions } from './composables/useForm'
export { useRemember } from './composables/useRemember'
export { useStream } from './composables/useStream'
export type { UseStreamOptions, UseStreamReturn } from './composables/useStream'
export { BridgeLink } from './components/BridgeLink'
export { Deferred } from './components/Deferred'
export { BridgeHead } from './components/BridgeHead'
export { router, getBridge } from '@swarakaka/bridge-core'
export type {
  Bridge,
  BridgePage,
  BridgeError,
  VisitOptions,
  VisitOutcome,
  Form,
  Method,
} from '@swarakaka/bridge-core'
