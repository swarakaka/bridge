export type MergeMode = 'replace' | 'merge' | 'append' | 'prepend'

/** Applies a stream/partial prop update using the protocol's merge modes. */
export function mergeValue(
  current: unknown,
  incoming: unknown,
  mode: MergeMode = 'replace',
): unknown {
  switch (mode) {
    case 'merge':
      if (isPlainObject(current) && isPlainObject(incoming)) return { ...current, ...incoming }
      return incoming
    case 'append':
      if (Array.isArray(current))
        return [...current, ...(Array.isArray(incoming) ? incoming : [incoming])]
      return incoming
    case 'prepend':
      if (Array.isArray(current))
        return [...(Array.isArray(incoming) ? incoming : [incoming]), ...current]
      return incoming
    default:
      return incoming
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Sets a (possibly dotted) key on a props object, returning a new object. */
export function setDeep(
  props: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const segments = key.split('.')
  const result = { ...props }
  let cursor: Record<string, unknown> = result
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!
    const next = cursor[segment]
    cursor[segment] = isPlainObject(next) ? { ...next } : {}
    cursor = cursor[segment] as Record<string, unknown>
  }
  cursor[segments[segments.length - 1]!] = value
  return result
}

export function getDeep(props: Record<string, unknown>, key: string): unknown {
  let cursor: unknown = props
  for (const segment of key.split('.')) {
    if (!isPlainObject(cursor)) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

export function hasDeep(props: Record<string, unknown>, key: string): boolean {
  let cursor: unknown = props
  for (const segment of key.split('.')) {
    if (!isPlainObject(cursor) || !(segment in cursor)) return false
    cursor = cursor[segment]
  }
  return true
}
