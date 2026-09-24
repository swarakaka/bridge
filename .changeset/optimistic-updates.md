---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Optimistic updates: `router.optimistic((props) => patch).post(url)`, the `optimistic` visit option, `form.optimistic((props, data) => patch)` for the next submission (page and JSON forms), and an `optimistic` prop on `<BridgeForm>`. The patch shows at once; failures (validation errors, error responses, network failures, cancelled visits) show the server values again, a page from a successful visit replaces it, and a JSON success keeps it. Overlapping updates on one prop keep the newest value until the last settles, server data for a held prop waits until it is released, and optimistic values are never written to history state. `router.patchProps(patch)` applies server values without a request, for reconciling after JSON mutations.
