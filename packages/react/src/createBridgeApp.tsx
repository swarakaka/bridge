import {
  createBridge,
  requireResolver,
  type Bridge,
  type BridgeConfig,
  type PagesOption,
} from '@swarakaka/bridge-core'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { createElement, useEffect, useState, type ReactElement } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { BridgeContext, usePageState } from './context.js'
import {
  createComponentLoader,
  renderPage,
  withLayouts,
  type ComponentResolver,
  type PageComponent,
} from './page.js'

export type { ComponentResolver, PageComponent, PagesOption }

/**
 * Wraps the application, e.g. in context providers, on the client and the
 * server. Returns the element to render. The same function can be passed to
 * `createSsrRenderer`.
 */
export type WithApp = (
  app: ReactElement,
  context: { ssr: boolean; page: BridgePage | null },
) => ReactElement

export interface CreateBridgeAppOptions extends Omit<BridgeConfig, 'initialPage'> {
  /** Optional with the @swarakaka/bridge-vite plugin, which resolves from ./Pages. */
  resolve?: ComponentResolver | undefined
  /** Page directory shorthand, compiled into `resolve` by @swarakaka/bridge-vite. */
  pages?: PagesOption | undefined
  /** Wrap the application (providers) before it renders. */
  withApp?: WithApp | undefined
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

export async function createBridgeApp(options: CreateBridgeAppOptions = {}): Promise<BridgeApp> {
  const found = document.getElementById(options.id ?? 'app')
  if (!found) throw new Error(`Bridge root element #${options.id ?? 'app'} not found.`)
  const el: Element = found
  const {
    resolve: _resolve,
    pages: _pages,
    resolveError,
    withApp,
    id: _id,
    page,
    ...config
  } = options

  const { cache, load } = createComponentLoader(requireResolver(options, 'createBridgeApp'))
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
    // Set once React has committed (hydration included): tests and progressive UI
    // wait for it, and server-rendered markup is visible before it is interactive.
    useEffect(() => el.setAttribute('data-bridge-hydrated', 'true'), [])

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
    return renderPage(component, current, state.key)
  }

  const app = createElement(App)
  const tree = createElement(
    BridgeContext.Provider,
    { value: bridge },
    withApp ? withApp(app, { ssr: false, page: initial }) : app,
  )
  const root = el.hasAttribute('data-server-rendered') ? hydrateRoot(el, tree) : createRoot(el)
  if (!el.hasAttribute('data-server-rendered')) root.render(tree)
  bridge.init()
  return { bridge, root, el }
}
