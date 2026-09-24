import type { BridgePage } from '@swarakaka/bridge-protocol'
import { createElement, type ComponentType, type ReactElement } from 'react'

export type PageComponent = ComponentType<Record<string, unknown>> & {
  layout?: ComponentType<{ children: ReactElement }> | ComponentType<{ children: ReactElement }>[]
}
export type ComponentResolver = (
  name: string,
) => PageComponent | Promise<PageComponent | { default: PageComponent }>

/** Loads page components by name and caches them (shared by client and server). */
export function createComponentLoader(resolve: ComponentResolver) {
  const cache = new Map<string, PageComponent>()
  return {
    cache,
    async load(name: string): Promise<PageComponent> {
      const cached = cache.get(name)
      if (cached) return cached
      const resolved = await resolve(name)
      const component =
        (resolved as { default?: PageComponent }).default ?? (resolved as PageComponent)
      cache.set(name, component)
      return component
    },
  }
}

export function withLayouts(component: PageComponent, node: ReactElement): ReactElement {
  const layout = component.layout
  if (!layout) return node
  const layouts = Array.isArray(layout) ? layout : [layout]
  return layouts.reduceRight((child, Layout) => createElement(Layout, null, child), node)
}

/** The page element, identical on the server and the client so hydration matches. */
export function renderPage(component: PageComponent, page: BridgePage, key: number): ReactElement {
  return withLayouts(
    component,
    createElement(component, {
      ...(page.props as Record<string, unknown>),
      key: `${page.component}-${key}`,
    }),
  )
}
