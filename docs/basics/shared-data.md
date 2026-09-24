# Shared data

Shared props are included in every page. Register them in a service provider:

```php
use Bridge\Bridge;

public function boot(): void
{
    Bridge::share('auth', fn (Request $request) => [
        'user' => $request->user() ? UserResource::make($request->user())->resolve() : null,
    ]);

    Bridge::share('locale', app()->getLocale());
}
```

Closures are resolved per request and container-injected. Page props win over shared props with the same key.

Props shared while the application boots (service providers) apply to every request. Props shared later, from middleware or a controller, apply only to the request that shared them: Bridge drops them once the request is handled, so a long-lived worker such as Octane never carries one user's props into the next request.

## Defaults

Bridge shares two props out of the box:

- `flash`: `{ message, level }` read from the session keys in `bridge.flash.keys`, set by `Bridge::redirect()->flash()`. `null` when there is nothing to show.
- `errors`: validation errors from the session after a classic HTML form post. Page and JSON requests receive errors directly and do not use it.

## Reading shared props

::: code-group

```vue [Vue]
<script setup lang="ts">
const user = useProp<User | null>('auth.user')
</script>
```

```tsx [React]
const user = useProp<User | null>('auth.user')
```

:::

Shared props are ordinary props: a [partial reload](/data/partial-reloads) can name them, and `Bridge::always()` makes one present in every partial response.
