import { HEAD_ATTRIBUTE, createHeadData, renderHead, type HeadData } from '@swarakaka/bridge-core'
import { inject, type InjectionKey } from 'vue'

/** Collected by the SSR renderer; BridgeHead writes into it on the server. */
export type HeadContext = HeadData

export const HeadKey: InjectionKey<HeadContext> = Symbol('bridge-head')

export function useHeadContext(): HeadContext | null {
  return inject(HeadKey, null)
}

export const createHeadContext = createHeadData

export { HEAD_ATTRIBUTE, renderHead }
