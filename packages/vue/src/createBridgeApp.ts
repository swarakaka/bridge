import {
  createBridge,
  requireResolver,
  type Bridge,
  type BridgeConfig,
  type BridgePage,
  type PagesOption,
} from '@swarakaka/bridge-core'
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  type App as VueApp,
  type Component,
  type Plugin,
} from 'vue'
import { createComponentLoader, renderPage, withLayouts, type ComponentResolver } from './app.js'
import { createBridgePlugin } from './plugin.js'
import { pageStateRef } from './state.js'

export type { ComponentResolver, PagesOption }
export interface ErrorPageProps {
  status: number
  kind: string
  message: string
}

/**
 * Customises the Vue app before it mounts (client) or renders (server), e.g.
 * `app.use(i18n)`. The same function can be passed to `createSsrRenderer`.
 */
export type WithApp = (app: VueApp, context: { ssr: boolean; page: BridgePage | null }) => void

export interface CreateBridgeAppOptions extends Omit<BridgeConfig, 'initialPage'> {
  /**
   * Resolve a page component by name, e.g. from import.meta.glob. Optional with
   * the @swarakaka/bridge-vite plugin, which resolves from ./Pages.
   */
  resolve?: ComponentResolver | undefined
  /** Page directory shorthand, compiled into `resolve` by @swarakaka/bridge-vite. */
  pages?: PagesOption | undefined
  /** Customise the app (plugins, components) before it mounts. Not called with `setup`. */
  withApp?: WithApp | undefined
  /** Optional: an error component rendered in place of the page for non-validation errors. */
  resolveError?:
    ((status: number) => Component | Promise<Component | { default: Component }> | null) | undefined
  /** Custom mounting instead of the default createApp(App).use(plugin).mount(el). */
  setup?:
    | ((context: {
        el: Element
        App: Component
        props: Record<string, unknown>
        plugin: Plugin
        bridge: Bridge
      }) => VueApp | void)
    | undefined
  /** Root element id (default "app"). */
  id?: string | undefined
  /** Page to start with (default: the embedded #bridge-page, or a bootstrap request). */
  page?: BridgePage | null | undefined
}

export interface BridgeApp {
  bridge: Bridge
  app: VueApp | null
  el: Element
}

/**
 * Mounts a Bridge-driven Vue application (PLAN §10.3). Supports a `layout`
 * static property on page components: a component, or an array (outermost first).
 */
export async function createBridgeApp(options: CreateBridgeAppOptions = {}): Promise<BridgeApp> {
  const el = document.getElementById(options.id ?? 'app')
  if (!el) throw new Error(`Bridge root element #${options.id ?? 'app'} not found.`)

  const {
    resolve: _resolve,
    pages: _pages,
    resolveError,
    setup,
    withApp,
    id: _id,
    page,
    ...config
  } = options
  if (setup && withApp) {
    throw new Error('createBridgeApp: pass `setup` or `withApp`, not both.')
  }

  const { cache, load } = createComponentLoader(requireResolver(options, 'createBridgeApp'))

  const bridge = createBridge({
    ...config,
    initialPage: page === undefined ? undefined : page,
    prepare: async (next) => {
      await load(next.component)
      await config.prepare?.(next)
    },
  })

  const errorCache = new Map<number, Component>()
  const loadError = async (status: number): Promise<Component | null> => {
    if (!resolveError) return null
    const cached = errorCache.get(status)
    if (cached) return cached
    const resolved = await resolveError(status)
    if (!resolved) return null
    const component = (resolved as { default?: Component }).default ?? (resolved as Component)
    errorCache.set(status, component)
    return component
  }

  if (!bridge.store.page) await bridge.bootstrap()
  const initial = bridge.store.page
  if (initial) await load(initial.component)

  const App = defineComponent({
    name: 'BridgeApp',
    setup() {
      const state = pageStateRef(bridge)
      let currentName: string | null = null
      let currentComponent: Component | null = null
      let currentErrorComponent: Component | null = null
      let currentErrorStatus: number | null = null

      return () => {
        const pageState = state.value
        const current = pageState.page

        if (pageState.error) {
          if (currentErrorStatus !== pageState.error.status) {
            const status = pageState.error.status
            currentErrorStatus = status
            currentErrorComponent = null
            void loadError(status).then((component) => {
              // A different error (or a page) may have replaced this one meanwhile.
              if (currentErrorStatus !== status) return
              currentErrorComponent = component
              state.value = { ...state.value }
            })
          }
          if (currentErrorComponent) {
            return withLayouts(
              currentErrorComponent,
              h(currentErrorComponent, {
                ...pageState.error,
                key: `error-${pageState.error.status}`,
              }),
            )
          }
          return h(
            'div',
            { 'data-bridge-error': pageState.error.status },
            `${pageState.error.status}: ${pageState.error.message}`,
          )
        }
        currentErrorStatus = null

        if (!current) return null

        if (currentName !== current.component) {
          const cached = cache.get(current.component)
          if (cached) {
            currentName = current.component
            currentComponent = cached
          } else {
            void load(current.component).then(() => {
              state.value = { ...state.value }
            })
            return currentComponent ? renderPage(currentComponent, current, pageState.key) : null
          }
        }

        return currentComponent ? renderPage(currentComponent, current, pageState.key) : null
      }
    },
  })

  const plugin = createBridgePlugin(bridge)
  const props = { initialPage: initial }
  let app: VueApp | null = null

  if (setup) {
    app = setup({ el, App, props, plugin, bridge }) ?? null
  } else {
    // Hydrate server-rendered markup (data-server-rendered) or mount fresh.
    const serverRendered = el.hasAttribute('data-server-rendered')
    app = serverRendered
      ? createSSRApp({ render: () => h(App) })
      : createApp({ render: () => h(App) })
    app.use(plugin)
    withApp?.(app, { ssr: false, page: initial })
    app.mount(el)
    // Signals interactivity to tests and progressive UI (server-rendered markup is visible earlier).
    el.setAttribute('data-bridge-hydrated', 'true')
  }

  bridge.init()

  return { bridge, app, el }
}
