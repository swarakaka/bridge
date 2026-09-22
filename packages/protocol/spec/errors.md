# Errors

One error model, four representations. The server maps every exception to an **error envelope** and each mode renders it. Controllers never handle representation.

## 1. Error envelope (abstract)

| Field        | Type                        | Meaning                                                                                        |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `status`     | integer                     | HTTP status.                                                                                   |
| `kind`       | string                      | One of the kinds in §2.                                                                        |
| `message`    | string                      | Human-readable, safe to show.                                                                  |
| `errors`     | object of string → string[] | Field errors. Present only for `validation`.                                                   |
| `redirect`   | string                      | Optional hint: where a client should navigate (typically the login URL for `unauthenticated`). |
| `retryAfter` | integer                     | Seconds. Present for `throttled`.                                                              |

## 2. Kinds

| Kind              | Status   | Source (Laravel)                                                                      |
| ----------------- | -------- | ------------------------------------------------------------------------------------- |
| `validation`      | 422      | `ValidationException`                                                                 |
| `unauthenticated` | 401      | `AuthenticationException`                                                             |
| `forbidden`       | 403      | `AuthorizationException`, `HttpException(403)`                                        |
| `not_found`       | 404      | `ModelNotFoundException`, `NotFoundHttpException`                                     |
| `csrf`            | 419      | `TokenMismatchException`                                                              |
| `throttled`       | 429      | `ThrottleRequestsException`                                                           |
| `conflict`        | 409      | application `HttpException(409)` (never used for build conflicts, which have no body) |
| `http`            | as given | any other `HttpException`                                                             |
| `server`          | 500      | any other `Throwable`                                                                 |

Implementations MAY add kinds; clients MUST treat unknown kinds like `http`.

## 3. Representations

### 3.1 html

Laravel's default behaviour is unchanged: validation redirects back with errors in the session; other errors render the application's error views.

### 3.2 page

Status as in §2, `Content-Type: application/vnd.bridge+json; v=1`, body:

```json
{
  "protocol": 1,
  "type": "error",
  "error": {
    "status": 422,
    "kind": "validation",
    "message": "The given data was invalid.",
    "errors": { "email": ["The email field is required."] }
  }
}
```

`redirect` and `retryAfter` appear when applicable. Validation in page mode is **never** represented as a redirect. The schema is `schemas/error.schema.json`.

Client behaviour:

| kind              | Default client action                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `validation`      | Deliver `errors` to the form (or visit) that made the request. Page state is untouched.           |
| `unauthenticated` | Navigate to `redirect` when present, else emit an error event.                                    |
| `csrf`            | Full document reload of the current URL (refreshes the CSRF cookie).                              |
| others            | Emit an error event; adapters MAY render an application-provided error component keyed by status. |

### 3.3 json

Laravel-native bodies, `Content-Type: application/json`:

| kind             | Body                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `validation`     | `{ "message": "...", "errors": { "field": ["..."] } }`                                                                  |
| `throttled`      | `{ "message": "Too Many Attempts." }` plus `Retry-After` header                                                         |
| `server`         | `{ "message": "Server Error." }` — plus `exception`, `file`, `line`, `trace` only when the application is in debug mode |
| every other kind | `{ "message": "..." }`                                                                                                  |

The schema is `schemas/json-error.schema.json`.

### 3.4 stream

A control event:

```
event: bridge
data: {"type":"error","status":403,"kind":"forbidden","message":"This action is unauthorized.","final":true}
```

`final: true` means the server closes the stream after the event and the client MUST NOT reconnect automatically. See [stream.md](stream.md).

Errors that occur **before** the stream is established (for example an unauthenticated request) are ordinary HTTP error responses with the `json` representation, because no `text/event-stream` body exists yet.

## 4. Debug information

`page` and `stream` representations never include stack traces. `json` includes them only in debug mode, mirroring Laravel.
