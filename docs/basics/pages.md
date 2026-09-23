# Pages

A page is a component name plus props, returned from a controller:

```php
use Bridge\Facades\Bridge;

public function show(Customer $customer)
{
    return Bridge::render('Customers/Show', [
        'customer' => CustomerResource::make($customer),
    ]);
}
```

The component name is an opaque string; the client's `resolve` function maps it to a file. Props may be anything Laravel can serialize: resources, collections, paginators, arrays, scalars, enums, dates, and closures (which are container-injected and resolved lazily).

## Receiving props

::: code-group

```vue [Vue]
<script setup lang="ts">
import { useProp, usePage } from '@swarakaka/bridge-vue'

defineProps<{ customer: Customer }>()

const { url, component } = usePage() // reactive page metadata
const name = useProp<string>('customer.name') // reactive ref to one prop, dot keys allowed
</script>
```

```tsx [React]
import { usePage, useProp } from '@swarakaka/bridge-react'

export default function Show({ customer }: { customer: Customer }) {
  const { url } = usePage()
  const name = useProp<string>('customer.name')
  return <h1>{name}</h1>
}
```

:::

`useProp` stays current through navigation, [partial reloads](/data/partial-reloads) and [stream prop pushes](/realtime/client).

## Layouts

Declare a static `layout` on the page component. It may be a single component or an array (outermost first). Layouts persist across navigations; they receive no page props and read what they need with `usePage()`.

::: code-group

```vue [Vue]
<script setup lang="ts">
defineOptions({ layout: [AppLayout, SettingsLayout] })
</script>
```

```tsx [React]
Settings.layout = [AppLayout, SettingsLayout]
```

:::

## Page metadata

The page object also carries `url` (path and query as the server routed it), `build` (see [Asset versioning](/advanced/asset-versioning)) and `deferred` (see [Deferred props](/data/deferred-props)). Unknown members are ignored by clients, which is how the protocol grows without breaking them.
