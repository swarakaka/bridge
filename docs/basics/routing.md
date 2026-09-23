# Routing

Bridge has no client-side route table. Routes are Laravel routes, and the client navigates by URL.

```php
Route::get('/customers', [CustomerController::class, 'index'])->name('customers.index');
Route::resource('customers', CustomerController::class);
```

## Generating URLs on the client

Bridge does not ship a route helper. Two approaches work well:

- **Pass URLs as props** when a page needs them: `'links' => ['create' => route('customers.create')]`.
- **Use a route generator** such as Ziggy if you want `route('customers.show', 1)` in JavaScript. Bridge is indifferent to it.

## Middleware

The `bridge` middleware (negotiation, build checks, `Vary`, `ETag`) is in the `web` group by default. Stream routes need only ordinary auth middleware plus, optionally, `throttle:bridge-stream`.

## Default mode for wildcard clients

A route or group can answer `Accept: */*` clients (curl, some HTTP libraries) with JSON instead of HTML:

```php
Route::get('/customers', ...)->defaults('bridge.default_mode', 'json');
```
