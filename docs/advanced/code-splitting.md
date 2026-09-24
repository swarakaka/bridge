# Code splitting

With the [Vite plugin](/installation/client-side#vite), `createBridgeApp()` already loads each page as its own chunk. `pages: { lazy: false }` bundles them all instead (see [Eager loading](#eager-loading)).

With your own `resolve`, pages are loaded on demand when it returns a promise, which `import.meta.glob` does by default:

::: code-group

```ts [Vue]
const pages = import.meta.glob('./Pages/**/*.vue') // lazy: one chunk per page

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.vue`]!(),
})
```

```tsx [React]
const pages = import.meta.glob('./Pages/**/*.tsx')

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.tsx`]!(),
})
```

:::

The router loads the component before swapping the page (its `prepare` hook), so a chunk that is still downloading never renders a blank page. [Prefetching](/data/prefetching) a link warms the page data but not the chunk; hover on a link long enough for a navigation usually leaves enough time for both.

## Eager loading

For small applications, or to avoid a chunk request on every navigation, bundle everything:

```ts
createBridgeApp({ pages: { path: './Pages', lazy: false } }) // with the Vite plugin

// or, with your own resolver:
const pages = import.meta.glob('./Pages/**/*.vue', { eager: true })

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.vue`],
})
```

## Stale chunks after a deploy

Old chunks disappear when you deploy new assets. [Asset versioning](/advanced/asset-versioning) forces a full document load on the first navigation after a deploy, so a stale client never requests a missing chunk. Keep the previous build's assets available for a few minutes if users may have pages open for a long time.
