# Error handling

Exceptions are mapped once, in Bridge's exception renderer, to one error envelope that each mode represents differently. Controllers never catch exceptions to shape a response.

| Kind              | Status    | Page mode                                             | JSON mode                        |
| ----------------- | --------- | ----------------------------------------------------- | -------------------------------- |
| `validation`      | 422       | `{ type: "error", error: { kind, message, errors } }` | `{ message, errors }`            |
| `unauthenticated` | 401       | with `redirect` hint                                  | `{ message }`                    |
| `forbidden`       | 403       |                                                       | `{ message }`                    |
| `not_found`       | 404       |                                                       | `{ message }`                    |
| `csrf`            | 419       | client reloads the document                           | `{ message }`                    |
| `throttled`       | 429       | with `retryAfter`                                     | `{ message }` + `Retry-After`    |
| `conflict`        | 409       | build conflict, `X-Bridge-Location`                   |                                  |
| `http`            | other 4xx | HTTP exception message                                | `{ message }`                    |
| `server`          | 500       | `"Server Error."`                                     | `{ message }` (+ trace in debug) |

HTML mode keeps Laravel's error pages. Page-mode errors never carry stack traces. Streams that fail before they are established answer with the JSON shape; established streams send an `error` control event.

## Client behaviour

- `validation` goes to the form or visit that made the request.
- `unauthenticated` navigates to `redirect` (typically the login page).
- `csrf` performs a full reload to refresh the token.
- Other errors render the `resolveError` component in place, without touching history, so the user can retry or go back.

::: code-group

```ts [Vue]
createBridgeApp({
  resolveError: (status) => import('./Pages/Error.vue'), // may pick a component per status
})
```

```tsx [React]
createBridgeApp({
  resolveError: (status) => import('./Pages/Error'),
})
```

:::

`resolveError` receives the HTTP status and returns the component (or a promise of it), which is rendered with the error envelope as props (`status`, `kind`, `message`). Without it, a plain "500: Server Error." text is rendered. `hardReloadOnError: true` performs a document load instead, which shows Laravel's own error page.

## Taking over

An `error` [event](/advanced/events) listener can return `false` to prevent the default rendering:

```ts
getBridge().on('error', ({ error }) => {
  if (error.status === 404) {
    router.visit('/')
    return false
  }
})
```

## Custom exceptions

Map your own exceptions by extending Laravel's handler as usual; Bridge picks up the resulting `HttpException` status. Exceptions that implement `Responsable` are left alone.
