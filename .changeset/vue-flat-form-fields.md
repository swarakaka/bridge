---
'@swarakaka/bridge-vue': minor
---

`useForm` exposes each field on the form object: `v-model="form.name"` and `form.items = [...form.items]` read and write `form.data`, so `isDirty`, `reset()`, submission and `remember` see either style. `form.data.*` keeps working. A field named like a form member (`errors`, `processing`, `data`, `reset`, `transform`, `progress`, ...) now makes `useForm` throw; rename it or nest it under another key. The React adapter and the core `Form` are unchanged.
