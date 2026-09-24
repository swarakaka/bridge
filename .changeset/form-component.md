---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

`<BridgeForm>` (Vue and React) submits a form written as plain inputs: values are read from the fields by name, so there is no `v-model` or state per field, and the slot, children function, ref and `useFormContext()` get the same form as `useForm` (errors, `processing`, `isDirty`, `reset`, Precognition). Props: `action`, `method`, `json`, `options`, `transform`, `headers`, `resetOnSuccess`, `resetOnError`, `setDefaultsOnSuccess`, `disableWhileProcessing`, `cancelOnUnmount`, `validationTimeout`, `validateFiles`, `remember`. Every form now accepts `resetOnError` and field lists for `resetOnSuccess` (listed fields reset before the new defaults are set), and `setDefaultsOnSuccess: false`. Core adds `formDataToObject`, `parseFieldName`, `readFormElement`, `writeFormElement` and `fileFieldNames`.
