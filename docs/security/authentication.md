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

| Mode | Response                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| HTML | Laravel's redirect to the login page                                                                             |
| Page | `401` with `kind: "unauthenticated"` and a `redirect` hint (`bridge.auth.login_url`); the client navigates there |
| JSON | `401` with `{ message }`                                                                                         |

## Streams

The connection request is authenticated like any request. Cookie sessions work with both transports. Bearer tokens need the fetch transport, which can send `Authorization`. For clients that cannot set headers, issue a signed ticket:

```php
$url = Bridge::streamTicket('events'); // 60 s, bound to the user and route parameters
```

The `bridge.ticket` middleware authenticates the ticketed request as that user for one request only. Bridge orders it before `auth:*` automatically. Long-lived credentials never belong in a URL; if access logs capture ticket URLs, treat them as sensitive or lower `bridge.stream.ticket_ttl_s`.
