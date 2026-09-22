// jsdom does not implement scrolling; server tests run in a Node environment without window.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true })
}
