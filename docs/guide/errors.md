# Errors

One error envelope, rendered per mode:

| Kind              | Status | Page mode                                             | JSON mode                        |
| ----------------- | ------ | ----------------------------------------------------- | -------------------------------- |
| `validation`      | 422    | `{ type: "error", error: { kind, message, errors } }` | `{ message, errors }`            |
| `unauthenticated` | 401    | with `redirect` hint                                  | `{ message }`                    |
| `forbidden`       | 403    |                                                       | `{ message }`                    |
| `not_found`       | 404    |                                                       | `{ message }`                    |
| `csrf`            | 419    | client reloads the document                           | `{ message }`                    |
| `throttled`       | 429    | with `retryAfter`                                     | `{ message }` + `Retry-After`    |
| `server`          | 500    | `"Server Error."`                                     | `{ message }` (+ trace in debug) |

Page-mode errors never carry stack traces. Streams that fail before they are established answer with the JSON shape; established streams send an `error` control event.

## Client behaviour

- `validation` goes to the form or visit that made the request.
- `unauthenticated` navigates to `redirect` (typically the login page).
- `csrf` performs a full reload to refresh the token.
- Other errors render the `resolveError` component in place without touching history. An `error` listener can return `false` to take over, and `hardReloadOnError` forces a document load instead.
