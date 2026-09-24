# Introduction

Bridge lets you build a single-page application with Laravel controllers and Vue or React components, without writing an API for the page and another for everything else. One controller action returns a page; Bridge serves it as a rendered HTML shell on first load, as a page object when the client navigates, as a plain JSON document to mobile and script clients, and can push updates to it over server-sent events.

```php
class CustomerController extends Controller
{
    public function index(Request $request)
    {
        return Bridge::render('Customers/Index', [
            'customers' => CustomerResource::collection(Customer::paginate(20)),
            'filters'   => ['search' => $request->string('search')->toString()],
        ]);
    }
}
```

```vue
<script setup lang="ts">
defineProps<{ customers: Paginated<Customer>; filters: { search: string | null } }>()
</script>

<template>
  <ul>
    <li v-for="customer in customers.data" :key="customer.id">{{ customer.name }}</li>
  </ul>
</template>
```

What happens for each client:

| Client sends                                                   | Bridge answers                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A browser navigation (`Accept: text/html`)                     | The application shell with the page embedded, optionally server-rendered |
| The Bridge client (`Accept: application/vnd.bridge+json; v=1`) | `{ "type": "page", "component": "Customers/Index", "props": {…} }`       |
| A mobile app or script (`Accept: application/json`)            | `{ "data": { "customers": {…}, "filters": {…} } }`                       |
| A stream route (`Accept: text/event-stream`)                   | `event: bridge` control events and your application events               |

## Where to start

- [Demo application](/getting-started/demo-application) shows every feature running.
- [Coming from Inertia](/getting-started/coming-from-inertia) maps familiar concepts to Bridge and lists the deliberate differences.
- [Server-side setup](/installation/server-side) and [Client-side setup](/installation/client-side) get a fresh Laravel app running in a few minutes.

## Status

Bridge is at 1.0 for the Laravel package and the Vue client. The React adapter is an experimental skeleton. See [Versioning](/reference/versioning).
