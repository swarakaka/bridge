---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Forms gain `resetAndClearErrors(...fields)` and `dontRemember(...fields)` (fields left out of remembered history state, on write and restore), and `useForm` in Vue and React accepts the remember key first: `useForm('login', data)`. In React, methods that return the form (`setData(...)`, `dontRemember(...)`) now return the re-rendering handle, so chains such as `form.setData('name', v).post(url)` update the component. `resetAndClearErrors`, `dontRemember`, `rememberable` and `unremembered` are new form member names, so a Vue form field with one of those names is refused.
