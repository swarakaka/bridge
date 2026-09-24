---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': patch
---

SSR and adapter fixes.

- `createBridge({ global: false })` keeps an instance out of `getBridge()` and the `router` proxy; the Vue SSR renderer uses it, so concurrent renders never share an instance.
- `useStream` inside a component connects on mount, so the first client render shows `idle` like the server markup and hydration matches.
- `BridgeHead` manages `<meta>` tags on the client (replacing server-rendered ones, marked `data-bridge-head="ssr"`) and restores the previous title on unmount.
- `BridgeLink`'s `activeClass` follows navigation inside persistent layouts.
- An error component that finishes loading after a newer error is no longer shown with the wrong props.
- The SSR server falls back to port 13714 when `BRIDGE_SSR_URL` has no port (it bound a random port).
- React `useForm`: `processing` and `validating` show while a request is in flight.
