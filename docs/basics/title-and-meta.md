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
- `meta` is an array of attribute maps rendered as `<meta …>` tags on the server; on the client it is currently ignored, which is fine for crawlers (they read the server output) and for most apps.

The React skeleton has no head component yet; set `document.title` in an effect.

## Static tags in the shell

Anything that never changes (charset, viewport, favicons, fonts) belongs in the Blade shell next to `<x-bridge::head />`.
