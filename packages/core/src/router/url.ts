export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

export function currentOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

export function toUrl(href: string | URL): URL {
  return href instanceof URL
    ? href
    : new URL(href, typeof window === 'undefined' ? 'http://localhost' : window.location.href)
}

export function isSameOrigin(href: string | URL): boolean {
  try {
    return toUrl(href).origin === currentOrigin()
  } catch {
    return false
  }
}

/** Path + query + hash, as the server reports it in `url` and as history stores it. */
export function relativeUrl(href: string | URL): string {
  const url = toUrl(href)
  return url.pathname + url.search + url.hash
}

/** How arrays appear in a query string: `a[0]=x&a[1]=y` (default) or `a[]=x&a[]=y`. */
export type QueryStringArrayFormat = 'indices' | 'brackets'

/**
 * Appends data as query parameters (Laravel bracket notation for nested
 * values). A key the data writes replaces the same key already in the URL.
 */
export function mergeQuery(
  href: string | URL,
  data: Record<string, unknown>,
  arrayFormat: QueryStringArrayFormat = 'indices',
): URL {
  const url = toUrl(href)
  const pairs: Array<[string, string]> = []
  const add = (key: string, value: unknown): void => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      value.forEach((v, i) => add(arrayFormat === 'brackets' ? `${key}[]` : `${key}[${i}]`, v))
      return
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(`${key}[${k}]`, v)
      return
    }
    pairs.push([key, value instanceof Date ? value.toISOString() : String(value)])
  }
  for (const [key, value] of Object.entries(data)) add(key, value)
  for (const [key] of pairs) url.searchParams.delete(key)
  for (const [key, value] of pairs) url.searchParams.append(key, value)
  return url
}

export function stripHash(href: string): string {
  const i = href.indexOf('#')
  return i === -1 ? href : href.slice(0, i)
}
