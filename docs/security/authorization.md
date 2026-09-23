# Authorization

Use policies, gates and form requests as usual. An `AuthorizationException` becomes `403` with `kind: "forbidden"` in page mode and `{ message }` in JSON mode; the HTML mode keeps Laravel's error page.

```php
public function update(UpdateCustomerRequest $request, Customer $customer)
{
    $this->authorize('update', $customer);
    // ...
}
```

## Props are authorized where they are produced

Because every mode runs the same controller, a prop that is filtered for the browser is filtered for JSON clients too. Do not rely on the client to hide data: anything in `props` is visible to anyone who can request the page.

## Partial reloads and prefetches

Both are ordinary requests with the user's credentials; the controller runs and authorizes again. A partial reload cannot obtain a prop the full page would not include.

## Streams

Channel membership is the authorization boundary for real-time data. The server assigns channels per connection, client-requested channels must pass `Bridge::channel()`, and reconnections are re-authorized. Prefer `invalidate` on shared channels so the data itself is always fetched through an authorized request. See [Channels and authorization](/realtime/channels).
