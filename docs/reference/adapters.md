# Writing an adapter

`@swarakaka/bridge-core` contains the request manager, response parser, router, history, page store, forms, cache and stream client. An adapter for another view layer only binds these to its reactivity model. The Vue adapter is about 400 lines.

An adapter must:

1. Create the bridge (`createBridge()` reads the embedded page and build id, or call `bridge.bootstrap()` for static shells).
2. Pass a `prepare(page)` hook that loads the page component before the swap, so renders are synchronous.
3. Subscribe to `bridge.store` and render `page.props` into the component named by `page.component`, keyed by `state.key` so non-preserved navigations remount.
4. Render `state.error` through an application-provided error component when set.
5. Expose forms (`bridge.form()`), streams (`bridge.stream()`), links and prefetch.
6. Call `bridge.init()` after mounting.

Nothing in the Laravel package changes for a new adapter. Mobile SDKs need only the JSON and stream specifications plus the golden fixtures to test their parsers offline.

## The React adapter

`packages/react` (`@swarakaka/bridge-react`, experimental) is the second adapter and has the Vue adapter's features: a context providing the bridge, `usePageState` built on `useSyncExternalStore`, `usePage`, `useProp`, `useDeferred`, `useForm` (with `remember`), `useJson` and `useJsonForm`, which re-render on every change through a proxy, `useRemember`, `useStream` (connects in an effect; `on(event, listener)` works before the connection opens), `BridgeLink` (prefetch, `except`, `headers`, visit callbacks, `activeClass`, attribute passthrough), `Deferred`, `BridgeHead`, a `createBridgeApp` that resolves components, applies static `layout` properties, renders the store's error state and hydrates a server-rendered root, and `@swarakaka/bridge-react/server` for SSR. Its tests run against the same mocked responses as the Vue adapter's, including a hydration check against its own server output.

## Server-side rendering

Adapters that support SSR provide a renderer that takes a page object and returns `{ head, body }`; the Vue one lives in `@swarakaka/bridge-vue/server`. The Laravel gateway is adapter-agnostic: it only speaks `POST /render`.
