# JSON mode

JSON mode serves mobile applications, scripts, and external services from the same routes and controllers as page mode. It is selected by `Accept: application/json`.

Design goals: feel like an ordinary Laravel API, add nothing a Laravel developer would not expect, and require no client SDK.

## 1. Envelope

A successful response has status `200` (or as set by the application) and body:

```jsonc
{
  "data": { "...props..." },
  "meta": { "...": "..." }      // optional; omitted when empty
}
```

| Field  | Type           | Required | Meaning                                                                     |
| ------ | -------------- | -------- | --------------------------------------------------------------------------- |
| `data` | object \| null | yes      | The resolved prop bag, or `null` for bodiless results (§3).                 |
| `meta` | object         | no       | Additive information: `location`, `flash`, and application-defined members. |

`data` contains the same props a page response would contain, with these differences:

- Deferred props are resolved and included inline (JSON clients have no post-render phase).
- Lazy props are excluded unless requested via `X-Bridge-Only`.
- No `component`, `url`, `build`, or `protocol` members: they have no meaning outside a client adapter.

The schema is `schemas/json.schema.json`.

## 2. Value shapes

Bridge does not define resource shapes. Each prop keeps the serialization Laravel would give it:

| Prop value                                   | Serialized as                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `JsonResource`                               | its resolved array (`toArray` + `with` + `additional`)                                              |
| `ResourceCollection` over a paginator        | `{ "data": [...], "links": {...}, "meta": {...} }` exactly as Laravel's paginated resource response |
| `ResourceCollection` over a plain collection | array                                                                                               |
| paginator (no resource)                      | Laravel's paginator array (`current_page`, `data`, `first_page_url`, …)                             |
| `Arrayable`, `JsonSerializable`, Collection  | as Laravel would                                                                                    |
| Enum                                         | its backing value                                                                                   |
| `DateTimeInterface`                          | ISO-8601 string (Laravel's default serialization)                                                   |
| scalar, array, null                          | as is                                                                                               |

Example for a paginated resource collection under the key `customers`:

```json
{
  "data": {
    "customers": {
      "data": [{ "id": 1, "name": "Acme" }],
      "links": {
        "first": "/customers?page=1",
        "last": "/customers?page=3",
        "prev": null,
        "next": "/customers?page=2"
      },
      "meta": {
        "current_page": 1,
        "from": 1,
        "last_page": 3,
        "path": "/customers",
        "per_page": 20,
        "to": 20,
        "total": 57
      }
    }
  }
}
```

## 3. Mutation results and redirects

Where page mode would redirect, JSON mode returns a result document:

```
HTTP/1.1 201 Created
Location: /customers/12
Content-Type: application/json

{ "data": { "customer": { "id": 12, "name": "Acme" } }, "meta": { "location": "/customers/12" } }
```

- Status is `200` by default, `201` when the application marks the result as created, or any status the application sets.
- `Location` MUST be present and MUST equal `meta.location`.
- `data` is `null` when the application attached no data.
- Flash messages, when the application sets any, appear under `meta.flash` as an object.

JSON clients MUST NOT be sent `3xx` responses by Bridge for application redirects. (Authentication middleware from the host application may still redirect; see [errors.md](errors.md) for how Bridge maps `unauthenticated` instead.)

## 4. Errors

Laravel-native shapes. See [errors.md](errors.md) §3.

## 5. Caching defaults

`Cache-Control: private, no-cache` with a weak `ETag`. Applications MAY opt into `public` caching per response; a server MUST refuse `public` for responses produced for an authenticated user unless explicitly forced.

`Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component`.

## 6. Versioning

JSON mode is the application's API. Bridge does not version it; applications use their usual mechanisms (route prefixes, resource classes). The Bridge protocol version parameter applies to page mode only.

## 7. Optional root selection

Servers MAY support selecting a single prop as the root of `data` (for example `data` = the `customer` prop, other props moved to `meta`). This is application configuration, not a client-controllable feature, and the resulting document MUST still validate against `schemas/json.schema.json`.
