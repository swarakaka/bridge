/**
 * @swarakaka/bridge-vue/server — render page objects to HTML for the Laravel
 * SSR gateway (PLAN §26). Build with `vite build --ssr resources/js/ssr.ts`.
 */
import {
  createBridge,
  requireResolver,
  type BridgePage,
  type PagesOption,
} from '@swarakaka/bridge-core'
import { createSSRApp, h, type App as VueApp, type Plugin } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { SsrRenderResult } from '@swarakaka/bridge-core/server'
import { createComponentLoader, createStaticApp, type ComponentResolver } from '../app.js'
import { createHeadContext, HeadKey, renderHead } from '../head.js'
import { createBridgePlugin } from '../plugin.js'
import type { WithApp } from '../createBridgeApp.js'

export interface CreateSsrRendererOptions {
  /** Optional with the @swarakaka/bridge-vite plugin, which resolves from ./Pages. */
  resolve?: ComponentResolver | undefined
  /** Page directory shorthand, compiled into `resolve` by @swarakaka/bridge-vite. */
  pages?: PagesOption | undefined
  /** Customise the Vue app before rendering; the same function `createBridgeApp` takes. */
  withApp?: WithApp | undefined
  /** Customize the Vue app (register plugins, components) before rendering. */
  setup?: ((context: { app: VueApp; plugin: Plugin; page: BridgePage }) => void) | undefined
}

export function createSsrRenderer(options: CreateSsrRendererOptions = {}) {
  const loader = createComponentLoader(requireResolver(options, 'createSsrRenderer'))

  return async function render(page: BridgePage): Promise<SsrRenderResult> {
    const component = await loader.load(page.component)
    const bridge = createBridge({
      initialPage: page,
      window: undefined,
      build: page.build,
      global: false,
    })
    const head = createHeadContext()
    const app = createSSRApp({ render: () => h(createStaticApp(bridge, component, page)) })
    const plugin = createBridgePlugin(bridge)
    app.use(plugin)
    app.provide(HeadKey, head)
    options.withApp?.(app, { ssr: true, page })
    options.setup?.({ app, plugin, page })
    const body = await renderToString(app)
    return { head: renderHead(head), body }
  }
}

export { renderHead, createHeadContext, HeadKey } from '../head.js'
export { createSsrServer } from '@swarakaka/bridge-core/server'
export type { SsrRenderResult, SsrServerOptions } from '@swarakaka/bridge-core/server'
