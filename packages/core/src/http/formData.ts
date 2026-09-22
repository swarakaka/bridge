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
