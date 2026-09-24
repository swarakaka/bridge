---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Forms can bind a Precognition endpoint: `useForm('post', '/customers', data)` (also `useJsonForm`, or `form.withPrecognition(method, url)`), then `form.validate('email')`, `form.validate()` for the touched fields, and `form.submit()` without a method and URL. New `touch`, `touched`, `valid`, `invalid`, `setValidationTimeout` (debounce, default 1500 ms) and `validateFiles` (files are left out of validation requests by default); validate options gain `only` and `onBefore`. The explicit `form.validate(method, url, field)` is unchanged. `touch`, `touched`, `valid`, `invalid`, `withPrecognition`, `setValidationTimeout`, `validateFiles`, `submitTo` and `precog` are new form member names, so a Vue form field with one of those names is refused.
