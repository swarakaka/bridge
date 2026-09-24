---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

`form.setData` accepts a callback, `setData((data) => ({ ...data, tags: [...data.tags, tag] }))`; its result is merged into the data like `setData(values)`. Forms log a console warning, once per form, when a validation error (`422`) reaches a submit or `validate()` that passed `onError` but not `onInvalid`, since validation errors only go to `onInvalid`.
