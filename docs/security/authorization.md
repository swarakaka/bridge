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

[Watched props](/realtime/watched-props) follow the same rule: a change publishes tags (`customers.12`), never data, and the reload goes through the controller. Tags do show table names (or class names, with the `class` style and no morph map) and record keys to every subscriber of the channel. Publish them on per-tenant channels (`streamOn()`), and use UUIDs or `bridgeTag()` where keys are sensitive. The `client` member of these messages is a hash of the tab's random token, never the token itself.
