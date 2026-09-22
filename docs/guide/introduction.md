# Introduction

Bridge lets one Laravel controller action serve three kinds of clients from the same route, guards, policies and business logic:

```php
public function index(Request $request)
{
    return Bridge::render('Customers/Index', [
        'customers' => CustomerResource::collection(Customer::paginate(20)),
        'filters'   => ['search' => $request->string('search')->toString()],
        'stats'     => Bridge::defer(fn () => Customer::stats()),
    ]);
}
```

| Client sends                                | Bridge answers                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `Accept: text/html`                         | The application shell with the initial page object embedded                   |
| `Accept: application/vnd.bridge+json; v=1`  | `{ "type": "page", "component": "Customers/Index", "url", "props", "build" }` |
| `Accept: application/json`                  | `{ "data": { "customers": {…}, "filters": {…}, "stats": {…} } }`              |
| `Accept: text/event-stream` (stream routes) | `event: bridge` control events and application events                         |

## How it differs from Inertia

Bridge borrows Inertia's developer experience (page components receive props, forms, partial reloads, deferred props) but is designed as **Laravel → Bridge Protocol → Client**:

- Mode selection uses standard `Accept` negotiation, not a marker header.
- JSON mode is part of the protocol, so mobile apps use the same controllers.
- Validation returns `422` directly in page and JSON mode (no redirect-back with session flash), which makes stateless clients behave like browsers.
- Server-sent events are a first-class mode with an event bus interface.
- The client runtime is framework-agnostic; the Vue adapter is a thin binding, and a React adapter needs no server changes.

## Status

Pre-release. The Laravel package, protocol, client runtime, Vue adapter, playground and test suites exist. See the [protocol reference](/guide/protocol) for what is normative.
