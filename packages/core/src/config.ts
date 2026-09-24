import type { BridgePage } from '@swarakaka/bridge-protocol'
import type { FormOptions } from './forms/FormState.js'

export interface BridgeConfig {
  /** Initial page (from the embedded #bridge-page element by default). */
  initialPage?: BridgePage | null | undefined
  /** Asset build id sent as X-Bridge-Build (from <meta name="bridge-build"> by default). */
  build?: string | null | undefined
  /** Prefetch cache: fresh TTL and stale-while-revalidate window in ms. */
  cache?: { ttl?: number | undefined; staleWhileRevalidate?: number | undefined } | undefined
  /** Coalescing window for reload() calls in ms. */
  reloadDebounce?: number | undefined
  /** Prefer full-document reloads over an in-page error display for non-validation errors. */
  hardReloadOnError?: boolean | undefined
  /** Allow `navigate` control events and redirects to other origins to be followed. */
  allowExternalNavigate?: boolean | undefined
  /**
   * Defaults for every form (`useForm`, `useJsonForm`, `<BridgeForm>`), for example
   * `{ recentlySuccessfulFor: 3000 }`; a form's own options win.
   */
  forms?: FormOptions | undefined
  /** Called with a page before it is applied (adapters load the component here). */
  prepare?: ((page: BridgePage) => Promise<void> | void) | undefined
  fetch?: typeof fetch | undefined
  /**
   * Register as the instance behind `getBridge()` and the `router` proxy
   * (default true). Server renderers create one instance per request and pass
   * false, so concurrent renders never see each other's instance.
   */
  global?: boolean | undefined
  credentials?: RequestCredentials | undefined
  window?: Window | undefined
}

export const DEFAULT_CONFIG = {
  cache: { ttl: 30_000, staleWhileRevalidate: 30_000 },
  reloadDebounce: 50,
  hardReloadOnError: false,
  allowExternalNavigate: false,
} as const
