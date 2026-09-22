/**
 * @swarakaka/bridge-protocol
 *
 * Types generated from the JSON Schemas in ../schemas plus hand-written
 * constants and type guards. The Markdown in ../spec is normative.
 */
export * from './generated'

import type { BridgePage } from './generated/page'
import type { BridgeError } from './generated/error'
import type { BridgeJsonDocument } from './generated/json'
import type { BridgeStreamControl } from './generated/stream-control'

/** Highest protocol version this package describes. */
export const PROTOCOL_VERSION = 1 as const

export const MEDIA_TYPES = {
  page: 'application/vnd.bridge+json',
  json: 'application/json',
  stream: 'text/event-stream',
  html: 'text/html',
} as const

export type Mode = keyof typeof MEDIA_TYPES

/** The `Accept` value a page-mode client sends. */
export const PAGE_ACCEPT = `${MEDIA_TYPES.page}; v=${PROTOCOL_VERSION}` as const

export const HEADERS = {
  build: 'X-Bridge-Build',
  only: 'X-Bridge-Only',
  except: 'X-Bridge-Except',
  component: 'X-Bridge-Component',
  location: 'X-Bridge-Location',
  lastEventId: 'Last-Event-ID',
} as const

/** Reserved SSE event name for control events. */
export const CONTROL_EVENT = 'bridge' as const

/** Element id of the embedded page object in an HTML shell. */
export const EMBEDDED_PAGE_ID = 'bridge-page' as const

/** Value of `Vary` on page and JSON responses. */
export const VARY = 'Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component' as const

export type BridgeDocument = BridgePage | BridgeError

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPage(value: unknown): value is BridgePage {
  return (
    isObject(value) &&
    value.type === 'page' &&
    typeof value.component === 'string' &&
    typeof value.url === 'string' &&
    isObject(value.props)
  )
}

export function isError(value: unknown): value is BridgeError {
  return isObject(value) && value.type === 'error' && isObject(value.error)
}

export function isJsonDocument(value: unknown): value is BridgeJsonDocument {
  return isObject(value) && 'data' in value && (value.data === null || isObject(value.data))
}

export function isControlEvent(value: unknown): value is BridgeStreamControl {
  return isObject(value) && typeof value.type === 'string'
}

/** Parses the `v` parameter of a Bridge media type; `null` when the type is not Bridge's. */
export function parseBridgeContentType(contentType: string | null | undefined): number | null {
  if (!contentType) return null
  const [type, ...params] = contentType.split(';').map((s) => s.trim())
  if (type?.toLowerCase() !== MEDIA_TYPES.page) return null
  for (const p of params) {
    const [k, v] = p.split('=').map((s) => s.trim())
    if (k?.toLowerCase() === 'v' && v && /^\d+$/.test(v)) return Number(v)
  }
  return PROTOCOL_VERSION
}
