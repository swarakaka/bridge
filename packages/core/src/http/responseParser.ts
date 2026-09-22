import {
  HEADERS,
  MEDIA_TYPES,
  isError,
  isPage,
  parseBridgeContentType,
} from '@swarakaka/bridge-protocol'
import type { BridgeError, BridgePage } from '@swarakaka/bridge-protocol'

/** Transport-agnostic view of an HTTP response (fetch Response or XHR). */
export interface HttpResponse {
  status: number
  headers: Headers
  /** Final URL after redirects. */
  url: string
  text(): Promise<string>
}

export type ParsedResponse =
  | { kind: 'page'; page: BridgePage; url: string; status: number }
  | { kind: 'error'; error: BridgeError['error']; status: number; url: string }
  | { kind: 'conflict'; location: string }
  | { kind: 'unsupported'; status: number }
  | { kind: 'empty'; status: number; url: string }
  | { kind: 'invalid'; status: number; contentType: string | null; body: string; url: string }

export async function parseResponse(response: HttpResponse): Promise<ParsedResponse> {
  const contentType = response.headers.get('content-type')

  if (response.status === 409 && response.headers.get(HEADERS.location)) {
    return { kind: 'conflict', location: response.headers.get(HEADERS.location)! }
  }

  if (response.status === 406) {
    return { kind: 'unsupported', status: 406 }
  }

  if (response.status === 204 || response.status === 304) {
    return { kind: 'empty', status: response.status, url: response.url }
  }

  const version = parseBridgeContentType(contentType)
  const body = await response.text()

  if (version === null) {
    return { kind: 'invalid', status: response.status, contentType, body, url: response.url }
  }

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return { kind: 'invalid', status: response.status, contentType, body, url: response.url }
  }

  if (isPage(json)) {
    return { kind: 'page', page: json, url: response.url, status: response.status }
  }

  if (isError(json)) {
    return { kind: 'error', error: json.error, status: response.status, url: response.url }
  }

  return { kind: 'invalid', status: response.status, contentType, body, url: response.url }
}

export function isBridgeContentType(contentType: string | null): boolean {
  return contentType !== null && contentType.toLowerCase().startsWith(MEDIA_TYPES.page)
}
