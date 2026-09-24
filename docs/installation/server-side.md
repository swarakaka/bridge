# Server-side setup

Requirements: PHP 8.4 or newer and Laravel 13.

## Install the package

```bash
composer require swarakaka/bridge-laravel
php artisan bridge:install
```

`bridge:install` publishes `config/bridge.php` and `resources/views/app.blade.php`. The `bridge` middleware is appended to the `web` group automatically (`bridge.middleware.auto_register`).

The default stream driver, `database`, stores events in a `bridge_stream_events` table. The package loads its migration, so `php artisan migrate` creates the table. When that table is missing, `bridge:install` offers to run `migrate`; pass `--without-migrations` to skip the question.

## Your own middleware (optional)

To keep the middleware in your application, for example to share props per request, generate a subclass:

```bash
php artisan bridge:middleware
```

It creates `app/Http/Middleware/HandleBridgeRequests.php`, which extends the package middleware. Append it to the `web` group in `bootstrap/app.php`:

```php
->withMiddleware(function (Middleware $middleware): void {
    $middleware->web(append: [
        \App\Http\Middleware\HandleBridgeRequests::class,
    ]);
})
```

Bridge stops adding its own middleware to `web` once the group contains a subclass, so it never runs twice. Keep it last in the group so the session, CSRF and authentication run before it. See [shared data](/basics/shared-data#from-middleware) for the `share()` method.

## The root template

The shell is a Blade view that marks where the client mounts. Set `bridge.shell.view` to `app` to use the published one:

```blade
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <x-bridge::head />
    @vite(['resources/js/app.ts'])
</head>
<body>
    <x-bridge::app class="antialiased" />
</body>
</html>
```

`<x-bridge::head />` emits the protocol and build meta tags (and server-rendered head fragments); `<x-bridge::app />` emits the embedded page data block and the root element, and passes attributes such as `class` through. The `@bridgeHead` and `@bridge` directives produce identical output if you prefer directives.

::: warning Compiled views
Blade caches compiled views. After upgrading the package, run `php artisan view:clear` so the shell picks up directive changes.
:::

## Your first page

```php
// routes/web.php
Route::get('/customers', [CustomerController::class, 'index']);

// app/Http/Controllers/CustomerController.php
use Bridge\Bridge;

public function index()
{
    return Bridge::render('Customers/Index', [
        'customers' => CustomerResource::collection(Customer::paginate(20)),
    ]);
}
```

Continue with the [client-side setup](/installation/client-side).

## Serving mobile clients from the same routes

Put the routes behind `auth:sanctum` so browser sessions and bearer tokens share URLs, and swap the CSRF middleware for Bridge's variant, which skips verification only for bearer requests without a session cookie:

```php
// bootstrap/app.php
$middleware->replaceInGroup('web', PreventRequestForgery::class, \Bridge\Http\Middleware\VerifyCsrfToken::class);
```

See [JSON mode](/beyond/json-mode) and [CSRF protection](/security/csrf).
