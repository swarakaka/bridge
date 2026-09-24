# Authentication

Bridge does not authenticate anyone. Guards, sessions, Sanctum, Passport and OAuth work exactly as in any Laravel application. Bridge only decides how the response is represented after Laravel has decided who is asking.

## One route, two credentials

Put routes behind `auth:sanctum` so a browser session and a bearer token both work:

```php
Route::middleware('auth:sanctum')->group(function () {
    Route::resource('customers', CustomerController::class);
    Route::get('/events', fn () => Bridge::stream()->channels(fn ($user) => ["user.{$user->id}"]));
});
```

For bearer clients on `web` routes, use Bridge's [CSRF middleware variant](/security/csrf).

## Unauthenticated requests

An `AuthenticationException` is represented per mode:

| Mode | Response                                                                               |
| ---- | -------------------------------------------------------------------------------------- |
| HTML | Laravel's redirect to the login page                                                   |
| Page | `401` with `kind: "unauthenticated"` and a `redirect` hint; the client navigates there |
| JSON | `401` with `{ message }`                                                               |

The `redirect` hint is the exception's own target: Laravel's guest redirect (`$middleware->redirectGuestsTo(...)`, `route('login')` by default). When there is none, or the `login` route does not exist, Bridge uses `bridge.auth.login_url`.

## Laravel Fortify and other auth packages

Fortify and Laravel's `verified` and `password.confirm` middleware choose between JSON and a redirect with `$request->wantsJson()`. Bridge presents a page visit to them as a browser navigation (see [`wantsJson()` in page mode](/core-concepts/modes#wantsjson-and-expectsjson-in-page-mode)), so they behave as they do for a classic form post:

| Fortify action               | Page mode (Bridge client)                            | JSON mode (`Accept: application/json`) |
| ---------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Login                        | `303` to `redirect()->intended(...)`                 | `{ "two_factor": false }`              |
| Login with two-factor on     | `303` to the `two-factor.login` challenge page       | `{ "two_factor": true }`               |
| Two-factor challenge, logout | `303` to the intended page, or `/` after logout      | `204`                                  |
| Password reset flows         | `303` (back, or to the login page), `status` flashed | `{ "message": ... }`                   |
| Failed validation            | `422` with `kind: "validation"` (Bridge's renderer)  | `422` Laravel-native                   |

Render Fortify's views with Bridge (`Fortify::loginView(fn () => Bridge::render('Auth/Login'))`, and likewise for the other views) and submit the forms with `useForm`. Fortify flashes its messages as `status`, which is not Bridge's `flash` prop: share it yourself, for example `Bridge::share('status', fn () => session('status'))`. Bridge has no dependency on Fortify.

## Streams

The connection request is authenticated like any request. Cookie sessions work with both transports. Bearer tokens need the fetch transport, which can send `Authorization`. For clients that cannot set headers, issue a signed ticket:

```php
$url = Bridge::streamTicket('events'); // 60 s, bound to the user and route parameters
```

The `bridge.ticket` middleware authenticates the ticketed request as that user for one request only. Bridge orders it before `auth:*` automatically. Long-lived credentials never belong in a URL; if access logs capture ticket URLs, treat them as sensitive or lower `bridge.stream.ticket_ttl_s`.
