---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Load when visible: `<WhenVisible data="activity" :buffer="200">` (Vue and React) loads props, usually `Bridge::lazy()` ones, with a partial reload when its element approaches the viewport, showing the `fallback` until they are present. Loading happens once by default (`always` reloads on every entry), goes through `router.reload()` so widgets visible together share one request, and marks the keys loading for `useDeferred`. `useWhenVisible(elementRef, keys, options)` gives `{ visible, loading }` for custom markup, and core exports `loadWhenVisible(bridge, element, options)`. Fixed: a partial reload (deferred props, invalidations) no longer dismisses an error rendered in place of the page.
