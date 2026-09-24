# Title and meta

`<BridgeHead>` sets the document title on the client and, during [server-side rendering](/advanced/server-side-rendering), records the title and meta tags into the rendered `<head>`.

```vue
<script setup lang="ts">
import { BridgeHead } from '@swarakaka/bridge-vue'
defineProps<{ customer: Customer }>()
</script>

<template>
  <BridgeHead
    :title="`${customer.name} · Customers`"
    :meta="[{ name: 'description', content: customer.company ?? '' }]"
  />
</template>
```

- `title` is applied to `document.title` when the component renders and updates reactively.
- `meta` is an array of attribute maps rendered as `<meta …>` tags. On the server they are marked `data-bridge-head="ssr"`; on the client each `BridgeHead` owns its tags, replaces the server-rendered ones on hydration and removes them when it unmounts, restoring the previous title.
- Values are escaped. Attribute names must be plain names (letters, digits, `-`, `_`, `:`, `.`, as in `name`, `property="og:title"`, `http-equiv`); any other name is dropped on both server and client, so meta maps built from user data cannot inject markup.

The React adapter has the same component:

```tsx
import { BridgeHead } from '@swarakaka/bridge-react'

;<BridgeHead
  title={`${customer.name} · Customers`}
  meta={[{ name: 'description', content: customer.company ?? '' }]}
/>
```

## Static tags in the shell

Anything that never changes (charset, viewport, favicons, fonts) belongs in the Blade shell next to `<x-bridge::head />`.
