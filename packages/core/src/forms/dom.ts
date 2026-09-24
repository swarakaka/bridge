import { formDataToObject, parseFieldName } from '../http/formData.js'

type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/** The form's current values, as a submission would send them (PLAN §14.2). */
export function readFormElement(form: HTMLFormElement): Record<string, unknown> {
  return formDataToObject(new FormData(form))
}

/**
 * Writes values into the form's fields by name: their current value
 * (`'value'`), or their default (`'default'`: `defaultValue`,
 * `defaultChecked`, `defaultSelected`, which a native reset restores). Only
 * fields whose value differs are touched, so typing is not disturbed. File
 * inputs can only be cleared.
 */
export function writeFormElement(
  form: HTMLFormElement,
  values: Record<string, unknown>,
  target: 'value' | 'default',
): void {
  const seen = new Map<string, number>()
  for (const element of fieldElements(form)) {
    const segments = parseFieldName(element.name)
    const list = segments.indexOf('')
    let value: unknown
    if (list === -1) {
      value = valueAt(values, segments)
    } else {
      const items = valueAt(values, segments.slice(0, list))
      const multiple =
        list === segments.length - 1 &&
        ((element instanceof HTMLInputElement && element.type === 'checkbox') ||
          (element instanceof HTMLSelectElement && element.multiple))
      if (multiple) {
        value = items
      } else {
        // The n-th field with this name holds the n-th item.
        const n = seen.get(element.name) ?? 0
        seen.set(element.name, n + 1)
        value = Array.isArray(items) ? valueAt(items[n], segments.slice(list + 1)) : undefined
      }
    }
    applyValue(element, value, target)
  }
}

/** Top-level names of the form's file inputs (never remembered in history state). */
export function fileFieldNames(form: HTMLFormElement): string[] {
  return fieldElements(form)
    .filter((element) => element instanceof HTMLInputElement && element.type === 'file')
    .map((element) => parseFieldName(element.name)[0]!)
}

function fieldElements(form: HTMLFormElement): FieldElement[] {
  return Array.from(form.elements)
    .filter(
      (element): element is FieldElement =>
        (element instanceof HTMLInputElement &&
          !['submit', 'button', 'reset', 'image'].includes(element.type)) ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement,
    )
    .filter((element) => element.name !== '')
}

function valueAt(data: unknown, segments: string[]): unknown {
  let cursor = data
  for (const segment of segments) {
    if (typeof cursor !== 'object' || cursor === null) return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

function matches(value: unknown, option: string): boolean {
  if (Array.isArray(value)) return value.map(String).includes(option)
  if (value === true) return true
  return value !== undefined && value !== null && value !== false && String(value) === option
}

function applyValue(element: FieldElement, value: unknown, target: 'value' | 'default'): void {
  if (element instanceof HTMLInputElement && element.type === 'file') {
    if (target === 'value' && (value === null || value === undefined) && element.value !== '')
      element.value = ''
    return
  }
  if (
    element instanceof HTMLInputElement &&
    (element.type === 'checkbox' || element.type === 'radio')
  ) {
    const on =
      element.type === 'radio'
        ? value !== undefined && value !== null && String(value) === element.value
        : matches(value, element.value)
    if (target === 'value' && element.checked !== on) element.checked = on
    if (target === 'default' && element.defaultChecked !== on) element.defaultChecked = on
    return
  }
  if (element instanceof HTMLSelectElement) {
    if (value === undefined) return
    for (const option of Array.from(element.options)) {
      const on = element.multiple
        ? matches(value, option.value)
        : String(value ?? '') === option.value
      if (target === 'value' && option.selected !== on) option.selected = on
      if (target === 'default' && option.defaultSelected !== on) option.defaultSelected = on
    }
    return
  }
  if (typeof value === 'object' && value !== null) return
  const text = value === undefined || value === null ? '' : String(value)
  if (target === 'value' && element.value !== text) element.value = text
  if (target === 'default' && element.defaultValue !== text) element.defaultValue = text
}
