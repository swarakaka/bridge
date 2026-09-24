export type RequestData = Record<string, unknown> | FormData

function isFile(value: unknown): boolean {
  return (
    (typeof File !== 'undefined' && value instanceof File) ||
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof FileList !== 'undefined' && value instanceof FileList)
  )
}

/** True when the data contains a File, Blob or FileList at any depth. */
export function hasFiles(data: unknown): boolean {
  if (data instanceof FormData) {
    for (const [, value] of data.entries()) if (typeof value !== 'string') return true
    return false
  }
  if (isFile(data)) return true
  if (Array.isArray(data)) return data.some(hasFiles)
  if (data && typeof data === 'object')
    return Object.values(data as Record<string, unknown>).some(hasFiles)
  return false
}

/** Flattens nested data into FormData using Laravel's bracket notation (a[b][0]). */
export function objectToFormData(
  data: Record<string, unknown>,
  form: FormData = new FormData(),
  parentKey: string | null = null,
): FormData {
  for (const [key, value] of Object.entries(data)) {
    append(form, parentKey ? `${parentKey}[${key}]` : key, value)
  }
  return form
}

function append(form: FormData, key: string, value: unknown): void {
  if (value === undefined) return
  if (value === null) {
    form.append(key, '')
    return
  }
  if (typeof FileList !== 'undefined' && value instanceof FileList) {
    Array.from(value).forEach((file, i) => form.append(`${key}[${i}]`, file))
    return
  }
  if (typeof File !== 'undefined' && value instanceof File) {
    form.append(key, value, value.name)
    return
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    form.append(key, value)
    return
  }
  if (typeof value === 'boolean') {
    form.append(key, value ? '1' : '0')
    return
  }
  if (value instanceof Date) {
    form.append(key, value.toISOString())
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      form.append(`${key}[]`, '')
      return
    }
    value.forEach((item, i) => append(form, `${key}[${i}]`, item))
    return
  }
  if (typeof value === 'object') {
    objectToFormData(value as Record<string, unknown>, form, key)
    return
  }
  form.append(key, String(value))
}

/**
 * Splits a field name into path segments: `a[b][0]`, `a.b`, `a[]` (the empty
 * segment appends to a list) and `a\.b` (a literal dot) are all understood.
 */
export function parseFieldName(name: string): string[] {
  const segments: string[] = []
  let current = ''
  let pending = true
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]!
    if (ch === '\\' && name[i + 1] === '.') {
      current += '.'
      pending = true
      i++
    } else if (ch === '.') {
      if (pending) segments.push(current)
      current = ''
      pending = true
    } else if (ch === '[') {
      const end = name.indexOf(']', i)
      if (end === -1) {
        current += name.slice(i)
        break
      }
      if (pending) segments.push(current)
      segments.push(name.slice(i + 1, end))
      current = ''
      pending = false
      i = end
    } else {
      current += ch
      pending = true
    }
  }
  if (pending) segments.push(current)
  return segments
}

/**
 * The inverse of `objectToFormData`: nested objects and lists from field names
 * (see `parseFieldName`). A repeated name without `[]` keeps the last value; an
 * empty file input (a nameless, empty `File`) becomes `null`.
 */
export function formDataToObject(data: FormData): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [name, raw] of data.entries()) {
    const value = typeof raw !== 'string' && raw.name === '' && raw.size === 0 ? null : raw
    assign(root, parseFieldName(name), value)
  }
  return root
}

function assign(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let cursor: Record<string, unknown> | unknown[] = root
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1
    const list = Array.isArray(cursor)
    const key: string | number =
      list && segment === ''
        ? (cursor as unknown[]).length
        : list && /^\d+$/.test(segment)
          ? Number(segment)
          : segment
    const target = cursor as Record<string | number, unknown>
    if (last) {
      target[key] = value
      return
    }
    const next = segments[i + 1]!
    if (typeof target[key] !== 'object' || target[key] === null) {
      target[key] = next === '' || /^\d+$/.test(next) ? [] : {}
    }
    cursor = target[key] as Record<string, unknown> | unknown[]
  })
}
