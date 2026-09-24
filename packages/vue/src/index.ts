/**
 * @swarakaka/bridge-vue — Vue 3 bindings for Bridge (PLAN §10.3).
 */
export { createBridgeApp } from './createBridgeApp.js'
export type {
  CreateBridgeAppOptions,
  BridgeApp,
  ComponentResolver,
  ErrorPageProps,
  PagesOption,
  WithApp,
} from './createBridgeApp.js'
export { createBridgePlugin } from './plugin.js'
export { BridgeKey, useBridge } from './injection.js'
export { usePage, useProp, useDeferred } from './composables/usePage.js'
export type { PageRef } from './composables/usePage.js'
export { useForm } from './composables/useForm.js'
export type { ReactiveForm, UseFormOptions } from './composables/useForm.js'
export { useRemember } from './composables/useRemember.js'
export { useStream } from './composables/useStream.js'
export { useJson } from './composables/useJson.js'
export type { ReactiveJsonRequest, UseJsonOptions } from './composables/useJson.js'
export { useJsonForm } from './composables/useJsonForm.js'
export type { ReactiveJsonForm, UseJsonFormOptions } from './composables/useJsonForm.js'
export type { UseStreamOptions, UseStreamReturn } from './composables/useStream.js'
export { BridgeLink } from './components/BridgeLink.js'
export { Deferred } from './components/Deferred.js'
export { BridgeHead } from './components/BridgeHead.js'
export { BridgeForm, useFormContext, FormContextKey } from './components/BridgeForm.js'
export type {
  BridgeFormInstance,
  BridgeFormFields,
  BridgeFormOptions,
} from './components/BridgeForm.js'
export { router, getBridge } from '@swarakaka/bridge-core'
export type {
  Bridge,
  BridgePage,
  BridgeError,
  VisitOptions,
  VisitOutcome,
  Form,
  Method,
  QueryStringArrayFormat,
  JsonOutcome,
  JsonError,
  JsonMeta,
  JsonCallOptions,
  JsonForm,
  JsonSubmitOptions,
} from '@swarakaka/bridge-core'
