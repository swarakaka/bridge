import type { Bridge, BridgePage } from '@swarakaka/bridge-core'
import { defineComponent, h, type Component } from 'vue'
import { pageStateRef } from './state.js'

export type ComponentResolver = (
  name: string,
) => Component | Promise<Component | { default: Component }>

/** Loads page components by name and caches them (shared by client and server). */
export function createComponentLoader(resolve: ComponentResolver) {
  const cache = new Map<string, Component>()
  return {
    cache,
    async load(name: string): Promise<Component> {
      const cached = cache.get(name)
      if (cached) return cached
      const resolved = await resolve(name)
      const component = (resolved as { default?: Component }).default ?? (resolved as Component)
      cache.set(name, component)
      return component
    },
  }
}

export function withLayouts(component: Component, node: ReturnType<typeof h>) {
  const layout = (component as { layout?: Component | Component[] }).layout
  if (!layout) return node
  const layouts = Array.isArray(layout) ? layout : [layout]
  return layouts.reduceRight((child, Layout) => h(Layout, null, () => child), node)
}

export function renderPage(component: Component, page: BridgePage, key: number) {
  return withLayouts(component, h(component, { ...page.props, key: `${page.component}-${key}` }))
}

/** A component that renders one fixed page (used by the SSR renderer). */
export function createStaticApp(bridge: Bridge, component: Component, page: BridgePage) {
  return defineComponent({
    name: 'BridgeSsrApp',
    setup() {
      const state = pageStateRef(bridge)
      return () => renderPage(component, page, state.value.key)
    },
  })
}
