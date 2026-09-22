/** Reads Laravel's XSRF-TOKEN cookie (URL-encoded) for the X-XSRF-TOKEN header. */
export function readXsrfToken(
  cookieString: string = typeof document === 'undefined' ? '' : document.cookie,
): string | null {
  for (const part of cookieString.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'XSRF-TOKEN') {
      const value = rest.join('=')
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }
  }
  return null
}
