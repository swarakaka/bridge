/**
 * @swarakaka/bridge-vite — lets `createBridgeApp()` and `createSsrRenderer()`
 * find page components without a `resolve` callback.
 *
 *   // vite.config.ts
 *   plugins: [laravel({ input: ['resources/js/app.ts'] }), bridge(), vue()]
 *
 *   // resources/js/app.ts
 *   createBridgeApp()                     // ./Pages/**\/*.vue
 *   createBridgeApp({ pages: './Views' }) // another directory
 */
import type { Program } from 'estree'
import { parseAst, type Plugin } from 'vite'
import { ADAPTERS, transformBridgeCalls, type AdapterConfig } from './transform.js'

export interface BridgePluginOptions {
  /**
   * Extra adapter entry points to rewrite, keyed by import source, e.g.
   * `{ '@acme/bridge-solid': { extensions: ['.tsx'] } }`.
   */
  adapters?: Record<string, AdapterConfig> | undefined
}

export default function bridge(options: BridgePluginOptions = {}): Plugin {
  const adapters = { ...ADAPTERS, ...options.adapters }

  return {
    name: '@swarakaka/bridge-vite',
    transform(code, id) {
      // TypeScript and JSX are already compiled to JavaScript when normal plugins run.
      if (!/\.[cm]?[jt]sx?$/.test(id.split('?', 1)[0] ?? id)) return null
      return transformBridgeCalls(code, id, (source) => parseAst(source) as Program, adapters)
    },
  }
}

export { bridge }
export { ADAPTERS, buildResolver, transformBridgeCalls } from './transform.js'
export type { AdapterConfig, PagesConfig, TransformResult } from './transform.js'
