// jsdom does not implement scrolling; the router calls it on navigation.
Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true })
Object.defineProperty(window, 'scrollX', { value: 0, writable: true })
Object.defineProperty(window, 'scrollY', { value: 0, writable: true })
Object.defineProperty(window, 'scrollBy', { value: () => undefined, writable: true })
