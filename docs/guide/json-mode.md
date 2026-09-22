# JSON mode and mobile clients

Any HTTP client that sends `Accept: application/json` gets a JSON document from the same routes:

```bash
curl -H 'Accept: application/json' -H 'Authorization: Bearer <token>' https://app.test/customers
```

```json
{ "data": { "customers": { "data": [...], "links": {...}, "meta": {...} }, "filters": { "search": null } } }
```

- Each prop keeps Laravel's serialization; paginated resource collections keep `{data, links, meta}`.
- Deferred props resolve inline; lazy props are opt-in through `X-Bridge-Only`.
- Mutations return a result document instead of a redirect: `201` (with `->created()`) or `200`, a `Location` header and `{ data, meta: { location, flash } }`.
- Errors use Laravel's shapes, so Laravel's documentation applies.
- `->jsonRoot('customer')` makes one prop the `data` root and moves the rest to `meta`.

```php
return Bridge::redirect()
    ->route('customers.show', $customer)
    ->with('customer', CustomerResource::make($customer))
    ->flash('Customer created.')
    ->created();
```

## Authentication

Bridge does not authenticate. Use `auth:sanctum` on the shared routes: browsers authenticate with the session, mobile apps with bearer tokens. With Bridge's CSRF middleware variant the same `web` routes accept both safely. JSON mode is your API; version it with your usual tools. Bridge's protocol version applies to page mode only.
