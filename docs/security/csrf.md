# CSRF protection

Laravel's CSRF scheme is untouched. The Bridge client sends the `XSRF-TOKEN` cookie back as `X-XSRF-TOKEN` on every non-GET request, as Axios does, so forms work with no configuration.

## Expired tokens

A `TokenMismatchException` becomes `419` with `kind: "csrf"` in page mode. The client performs a full document load so the session and token are refreshed, and the user retries.

## Bearer clients on web routes

When mobile apps share `web` routes with the browser, they carry no session cookie and cannot obtain a CSRF token. Replace Laravel's CSRF middleware with Bridge's variant:

```php
// bootstrap/app.php
$middleware->replaceInGroup('web', PreventRequestForgery::class, \Bridge\Http\Middleware\VerifyCsrfToken::class);
```

It skips verification only for requests that carry `Authorization: Bearer …` **and no session cookie**. A browser with a cookie session is always verified, so the relaxation cannot be used to forge a request on behalf of a logged-in browser. Disable it with `bridge.csrf.skip_for_bearer`.
