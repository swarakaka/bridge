---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

`useJsonForm` (Vue and React) is `useForm` in JSON mode: the same fields, errors, `isDirty`, `reset`, `transform`, `validate` (Precognition), `remember` and `dontRemember`, submitted to the same routes with `Accept: application/json` and without navigating. The last successful response is `form.result` with `meta`, `httpStatus` and `message`. Core: the shared field state moved into `FormState`, which `Form` (page visits) and the new `JsonForm` extend; `bridge.jsonForm()` builds one. `Form`'s public API is unchanged. `JsonRequestOptions.mutation: false` sends a non-GET request without clearing the page cache.
