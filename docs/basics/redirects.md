# Redirects

Use `Bridge::redirect()` after mutations. It is represented per mode without any branching in the controller:

```php
public function store(StoreCustomerRequest $request)
{
    $customer = Customer::create($request->validated());

    return Bridge::redirect()
        ->route('customers.show', $customer)                    // or ->to('/customers/1'), ->back()
        ->with('customer', CustomerResource::make($customer))   // data for JSON clients
        ->flash('Customer created.', 'success')                 // flash message
        ->created();                                            // 201 in JSON mode (default 200)
}
```

| Mode | Result                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| HTML | `302` redirect, flash in the session                                                                                              |
| Page | `303` redirect; the client follows it with the page `Accept` header, and the next page's `flash` shared prop carries the message  |
| JSON | `201` (or the given status), a `Location` header and `{ "data": { "customer": {…} }, "meta": { "location": "…", "flash": {…} } }` |

## Plain Laravel redirects

`return redirect()->route(...)` also works for page requests: Bridge's middleware converts it to `303`. Redirects to other origins become `409` with `X-Bridge-Location`, which the client follows with a full document load; use `->external()` on `Bridge::redirect()` to say so explicitly.

## Status codes

Page mode always uses `303 See Other` so that a redirect after `POST`, `PUT` or `DELETE` is followed with `GET`.
