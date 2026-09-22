import { createBridge, type Bridge, type BridgeConfig } from '@swarakaka/bridge-core'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { createElement, useEffect, useState, type ComponentType, type ReactElement } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { BridgeContext, usePageState } from './context.js'

export type PageComponent = ComponentType<Record<string, unknown>> & {
  layout?: ComponentType<{ children: ReactElement }> | ComponentType<{ children: ReactElement }>[]
}
export type ComponentResolver = (
  name: string,
) => PageComponent | Promise<PageComponent | { default: PageComponent }>

export interface CreateBridgeAppOptions extends Omit<BridgeConfig, 'initialPage'> {
  resolve: ComponentResolver
  resolveError?: (
    status: number,
  ) => PageComponent | Promise<PageComponent | { default: PageComponent }> | null
  id?: string
  page?: BridgePage | null
}

export interface BridgeApp {
  bridge: Bridge
  root: Root
  el: Element
}

export async function createBridgeApp(options: CreateBridgeAppOptions): Promise<BridgeApp> {
  const el = document.getElementById(options.id ?? 'app')
  if (!el) throw new Error(`Bridge root element #${options.id ?? 'app'} not found.`)
  const { resolve, resolveError, id: _id, page, ...config } = options

  const cache = new Map<string, PageComponent>()
  const load = async (name: string): Promise<PageComponent> => {
    const cached = cache.get(name)
    if (cached) return cached
    const resolved = await resolve(name)
    const component =
      (resolved as { default?: PageComponent }).default ?? (resolved as PageComponent)
    cache.set(name, component)
    return component
  }
  const errorCache = new Map<number, PageComponent>()
  const loadError = async (status: number): Promise<PageComponent | null> => {
    if (!resolveError) return null
    const cached = errorCache.get(status)
    if (cached) return cached
    const resolved = await resolveError(status)
    if (!resolved) return null
    const component =
      (resolved as { default?: PageComponent }).default ?? (resolved as PageComponent)
    errorCache.set(status, component)
    return component
  }

  const bridge = createBridge({
    ...config,
    initialPage: page === undefined ? undefined : page,
    prepare: async (next) => {
      await load(next.component)
      await config.prepare?.(next)
    },
  })
  if (!bridge.store.page) await bridge.bootstrap()
  const initial = bridge.store.page
  if (initial) await load(initial.component)

  function App() {
    const state = usePageState(bridge)
    const [errorComponent, setErrorComponent] = useState<{
      status: number
      component: PageComponent | null
    } | null>(null)

    useEffect(() => {
      if (!state.error) return
      const status = state.error.status
      void loadError(status).then((component) => setErrorComponent({ status, component }))
    }, [state.error])

    if (state.error) {
      const Err = errorComponent?.status === state.error.status ? errorComponent.component : null
      if (Err) return withLayouts(Err, createElement(Err, { ...state.error }))
      return createElement(
        'div',
        { 'data-bridge-error': state.error.status },
        `${state.error.status}: ${state.error.message}`,
      )
    }
    const current = state.page
    if (!current) return null
    const component = cache.get(current.component)
    if (!component) return null
    return withLayouts(
      component,
      createElement(component, {
        ...(current.props as Record<string, unknown>),
        key: `${current.component}-${state.key}`,
      }),
    )
  }

  const tree = createElement(BridgeContext.Provider, { value: bridge }, createElement(App))
  const root = el.hasAttribute('data-server-rendered') ? hydrateRoot(el, tree) : createRoot(el)
  if (!el.hasAttribute('data-server-rendered')) root.render(tree)
  el.setAttribute('data-bridge-hydrated', 'true')
  bridge.init()
  return { bridge, root, el }
}

function withLayouts(component: PageComponent, node: ReactElement): ReactElement {
  const layout = component.layout
  if (!layout) return node
  const layouts = Array.isArray(layout) ? layout : [layout]
  return layouts.reduceRight((child, Layout) => createElement(Layout, null, child), node)
}
