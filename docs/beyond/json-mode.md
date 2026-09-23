# JSON mode

Any HTTP client that sends `Accept: application/json` gets a JSON document from the same routes and controllers that serve the browser:

```bash
curl -H 'Accept: application/json' -H 'Authorization: Bearer <token>' https://app.test/customers
```

```json
{ "data": { "customers": { "data": [...], "links": {...}, "meta": {...} }, "filters": { "search": null } } }
```

## Shapes

- Each prop keeps Laravel's serialization; paginated resource collections keep `{ data, links, meta }`.
- [Deferred props](/data/deferred-props) resolve inline; [lazy props](/data/lazy-props) are opt-in through `X-Bridge-Only`.
- `->jsonRoot('customer')` makes one prop the `data` root and moves the rest to `meta`, for the common "one resource per endpoint" shape.

## Mutations

Mutations return a result document instead of a redirect: `201` (with `->created()`) or `200`, a `Location` header and `{ data, meta: { location, flash } }`.

```php
return Bridge::redirect()
    ->route('customers.show', $customer)
    ->with('customer', CustomerResource::make($customer))
    ->flash('Customer created.')
    ->created();
```

## Errors

Laravel's shapes, so Laravel's documentation applies: `422` with `{ message, errors }`, `401`, `403`, `404`, `429` with `Retry-After`. Stack traces appear only when `app.debug` is on.

## Caching

Responses are `private, no-cache` with a weak `ETag`; send `If-None-Match` for `304` answers. See [Caching and private data](/security/caching).

## Versioning

JSON mode is your application's API. Version it with your usual tools (URL prefixes, headers, resources). Bridge's protocol version applies to page mode and streams only.

## Authentication

Bridge does not authenticate. Put the shared routes behind `auth:sanctum`: browsers authenticate with the session, other clients with bearer tokens. See [Authentication](/security/authentication) and [CSRF protection](/security/csrf).
