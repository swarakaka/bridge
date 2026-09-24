---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-protocol': patch
---

Fix client races in navigation, forms and streams.

- A background reload (stream `invalidate`, resync) waits for an in-flight visit or submit instead of aborting it, and is dropped if that visit left the page.
- `form.validate()` (Precognition) no longer goes through the visit pipeline: it never cancels a submit, a navigation or deferred props, emits no router events, and a newer call supersedes an older one. Its options are now `ValidateOptions` (`headers`, `onSuccess`, `onInvalid`, `onError`, `onFinish`); `onSuccess` and `onFinish` take no arguments.
- New `router.request(url, options)`: a page-protocol request outside the visit pipeline.
- A cached visit no longer paints over a newer one; a refused `onBefore` resets `form.processing`; back/forward applies only the latest restore, keeps scroll positions, and loads deferred props that never arrived; `init()` replaces a stale history entry after a full reload; `destroy()` stops a pending reload.
- The page cache is cleared on stream invalidations and prop updates and after JSON-mode mutations.
- `StreamClient`: closing while `resolveUrl` is pending no longer connects; a `resolveUrl` failure reports a transport error and retries; waking the tab during a reconnect no longer opens a second connection; malformed control events are ignored; the EventSource transport honours `end{reconnect:false}` and `error{final:true}`.
- Resync follows `spec/stream.md` §6.4: after an orderly `end`, a reconnect that sent `Last-Event-ID` and was not replayed reloads the page's props. The server's `end{max_duration}` now carries the connection cursor as its `id`.
