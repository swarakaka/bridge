/**
 * @swarakaka/bridge-react/server — render page objects to HTML for the Laravel
 * SSR gateway (PLAN §26). Build a Node bundle that calls
 * `createSsrServer({ render: createSsrRenderer({ resolve }) })`.
 */
import { createBridge, createHeadData, renderHead } from '@swarakaka/bridge-core'
import type { SsrRenderResult } from '@swarakaka/bridge-core/server'
import type { BridgePage } from '@swarakaka/bridge-protocol'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { BridgeContext } from '../context.js'
import { HeadContext } from '../head.js'
import { createComponentLoader, renderPage, type ComponentResolver } from '../page.js'

export interface CreateSsrRendererOptions {
  resolve: ComponentResolver
  /** Wrap the page, e.g. in application providers, before rendering. */
  wrap?: ((page: ReactElement, context: { page: BridgePage }) => ReactElement) | undefined
}

export function createSsrRenderer(options: CreateSsrRendererOptions) {
  const loader = createComponentLoader(options.resolve)

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
    const content = renderPage(component, page, bridge.store.current.key)
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
