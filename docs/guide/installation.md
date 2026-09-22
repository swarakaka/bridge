# Installation

Requirements: PHP 8.2+ (8.3+ for Laravel 13), Laravel 11 to 13, Node 20+, Vue 3.5+.

## Server

```bash
composer require swarakaka/bridge-laravel
php artisan bridge:install
```

`bridge:install` publishes `config/bridge.php` and `resources/views/app.blade.php`. Set `bridge.shell.view` to `app` to use the published shell. The `bridge` middleware is appended to the `web` group automatically.

The shell marks the mount point with Blade components (or the equivalent `@bridgeHead` and `@bridge` directives; the output is identical):

```blade
<head>
    <x-bridge::head />                {{-- <meta name="bridge-protocol">, <meta name="bridge-build">, SSR head fragments --}}
    @vite(['resources/js/app.ts'])
</head>
<body>
    <x-bridge::app class="h-full" />  {{-- the embedded page data block and <div id="app" data-bridge> --}}
</body>
```

`<x-bridge::app>` passes extra attributes (class, `data-*`) through to the root element, takes `id` to change the root id, and `:page="false"` to render an empty root without a data block. The page itself always travels in the `<script type="application/json" id="bridge-page">` block described in the protocol; it is never encoded into an attribute.

## Client

```bash
pnpm add @swarakaka/bridge-vue
```

```ts
// resources/js/app.ts
import { createBridgeApp } from '@swarakaka/bridge-vue'

const pages = import.meta.glob('./Pages/**/*.vue')

createBridgeApp({
  resolve: (name) => pages[`./Pages/${name}.vue`]!(),
  resolveError: () => import('./Pages/Errors/Error.vue'), // optional in-place error page
})
```

Page components receive the page props as Vue props. A static `layout` option wraps them:

```vue
<script setup lang="ts">
import AppLayout from '@/Layouts/AppLayout.vue'
defineOptions({ layout: AppLayout })
defineProps<{ customers: Paginated<Customer> }>()
</script>
```

## Mobile and API clients on the same routes

Use the `auth:sanctum` guard on your web routes so browser sessions and bearer tokens share URLs, and replace the CSRF middleware in the `web` group with Bridge's variant, which skips verification only for bearer requests that carry no session cookie:

```php
// bootstrap/app.php
$middleware->replaceInGroup('web', PreventRequestForgery::class, \Bridge\Http\Middleware\VerifyCsrfToken::class); // Laravel 13
$middleware->replaceInGroup('web', ValidateCsrfToken::class, \Bridge\Http\Middleware\VerifyCsrfToken::class);     // Laravel 11/12
```
