import { createBridgeApp } from 'fake-adapter'

export const defaults = createBridgeApp()
export const views = createBridgeApp({
  pages: { path: './Views', lazy: false, transform: (name) => name.toLowerCase() },
})
