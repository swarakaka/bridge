/**
 * @swarakaka/bridge-react/server — render page objects to HTML for the Laravel
 * SSR gateway (PLAN §26). Build a Node bundle that calls
 * `createSsrServer({ render: createSsrRenderer({ resolve }) })`.
 */
import {
  createBridge,
  createHeadData,
  renderHead,
  requireResolver,
  type PagesOption,
} from '@swarakaka/bridge-core'
import type { SsrRenderResult } from '@swarakaka/bridge-core/server'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { BridgeContext } from '../context.js'
import { HeadContext } from '../head.js'
import { createComponentLoader, renderPage, type ComponentResolver } from '../page.js'
import type { WithApp } from '../createBridgeApp.js'

export interface CreateSsrRendererOptions {
  /** Optional with the @swarakaka/bridge-vite plugin, which resolves from ./Pages. */
  resolve?: ComponentResolver | undefined
  /** Page directory shorthand, compiled into `resolve` by @swarakaka/bridge-vite. */
  pages?: PagesOption | undefined
  /** Wrap the application in providers; the same function `createBridgeApp` takes. */
  withApp?: WithApp | undefined
  /** Wrap the page, e.g. in application providers, before rendering. */
  wrap?: ((page: ReactElement, context: { page: BridgePage }) => ReactElement) | undefined
}

export function createSsrRenderer(options: CreateSsrRendererOptions = {}) {
  const loader = createComponentLoader(requireResolver(options, 'createSsrRenderer'))

  return async function render(page: BridgePage): Promise<SsrRenderResult> {
    const component = await loader.load(page.component)
    // One instance per render, kept out of getBridge()/router so concurrent renders stay apart.
    const bridge = createBridge({
      initialPage: page,
      window: undefined,
      build: page.build,
      global: false,
    })
    const head = createHeadData()
    const rendered = renderPage(component, page, bridge.store.current.key)
    const content = options.withApp ? options.withApp(rendered, { ssr: true, page }) : rendered
    const tree = createElement(
      BridgeContext.Provider,
      { value: bridge },
      createElement(
        HeadContext.Provider,
        { value: head },
        options.wrap ? options.wrap(content, { page }) : content,
      ),
    )
    const body = renderToString(tree)
    return { head: renderHead(head), body }
  }
}

export { createSsrServer } from '@swarakaka/bridge-core/server'
export type { SsrRenderResult, SsrServerOptions } from '@swarakaka/bridge-core/server'
