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

## From the client: `useJson`

A page component can call JSON mode too, for data it does not want in the page props or for a mutation that should not navigate: a search box that fills a dropdown, a "mark as read" button, an export. `useJson` sends `Accept: application/json` to the same routes with the same CSRF token, credentials and upload path as a page visit, and never touches the page or history.

```vue
<script setup lang="ts">
import { useJson } from '@swarakaka/bridge-vue'

const json = useJson<{ customer: { id: number; name: string } }>()

const create = () =>
  json.post('/customers', {
    data: { name: name.value, email: email.value },
    onSuccess: (data, meta) => console.log(data?.customer.id, meta.location),
  })
</script>

<template>
  <button :disabled="json.processing" @click="create">Create</button>
  <p v-if="json.errors.email">{{ json.errors.email }}</p>
  <p v-else-if="json.message">{{ json.message }}</p>
  <p v-if="json.data">Created #{{ json.data.customer.id }}</p>
</template>
```

| Member                                 | Meaning                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get/post/put/patch/delete(url, opts)` | Send a request; `opts.data` becomes the query string for `get` and the JSON or multipart body otherwise                                                                                               |
| `data`, `meta`                         | The envelope of the last successful response (`meta.location`, `meta.flash`, …)                                                                                                                       |
| `errors`, `allErrors`                  | First message per field, and all messages, from the last `422`                                                                                                                                        |
| `message`, `lastError`                 | Message of the last `422` or error; `lastError.kind` is `unauthenticated`, `forbidden`, `not_found`, `csrf`, `throttled`, `server`, `http` or `invalid` (not JSON), with `retryAfter` for `throttled` |
| `processing`, `progress`, `httpStatus` | In-flight flag, upload progress, status of the last response                                                                                                                                          |
| `cancel()`, `clearErrors()`, `reset()` | Abort the in-flight request, forget errors, forget everything                                                                                                                                         |

Each call also accepts `headers` (an `Authorization` header for a token), `only`/`except` for partial selection, and `onSuccess`, `onInvalid`, `onError`, `onException`, `onFinish` callbacks. The promise resolves to the same outcome (`success`, `invalid`, `error`, `exception` or `cancelled`) and never rejects. One handle runs one request at a time: starting another cancels the previous one, and unmounting the component cancels too (`cancelOnDispose: false` to opt out). Headers passed to `useJson({ headers })` go on every call.

The React adapter has the same hook, re-rendering on every change:

```tsx
import { useJson } from '@swarakaka/bridge-react'

const json = useJson<{ customer: { id: number } }>()
```

A `2xx` body that is not a Bridge envelope is exposed as `data` unchanged, so routes that return `response()->json()` work as well. Unlike page visits, a `419` or `401` does not reload or redirect: JSON calls are not navigations, so the component decides what to do.

Outside components, `getBridge().json` is the stateless client (`await bridge.json.get('/customers')` returns the outcome) and `getBridge().jsonRequest()` builds the same stateful handle for other adapters.

## Forms over JSON: `useJsonForm`

`useJson` is a request handle: you pass the body on each call. When the values are a form (fields, validation errors, dirty tracking, reset, live validation), use `useJsonForm`. It has the same field state and methods as [`useForm`](/basics/forms), and submits in JSON mode instead of as a page visit: nothing navigates, and the response is kept on the form.

::: code-group

```vue [Vue]
<script setup lang="ts">
import { useJsonForm } from '@swarakaka/bridge-vue'

const form = useJsonForm<{ name: string; email: string }, { customer: { id: number } }>(
  'post',
  '/customers',
  { name: '', email: '' },
)
</script>

<template>
  <form @submit.prevent="form.submit({ resetOnSuccess: true })">
    <input v-model="form.name" />
    <p v-if="form.errors.name">{{ form.errors.name }}</p>
    <input v-model="form.email" @blur="form.validate('email')" />
    <p v-if="form.errors.email">{{ form.errors.email }}</p>
    <button :disabled="form.processing">Create</button>
    <p v-if="form.result">Created #{{ form.result.customer.id }} at {{ form.meta.location }}</p>
  </form>
</template>
```

```tsx [React]
import { useJsonForm } from '@swarakaka/bridge-react'

export function CreateCustomer() {
  const form = useJsonForm<{ name: string }, { customer: { id: number } }>({ name: '' })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.post('/customers')
      }}
    >
      <input value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} />
      {form.errors.name && <p>{form.errors.name}</p>}
      {form.result && <p>Created #{form.result.customer.id}</p>}
    </form>
  )
}
```

:::

Beyond the `useForm` members (`data` and, in Vue, flat fields, `errors`, `processing`, `progress`, `isDirty`, `reset`, `transform`, `validate`, `remember`, `dontRemember`, ...):

| Member       | Meaning                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `result`     | `data` of the last successful response (the whole body for a route that does not return a Bridge envelope) |
| `meta`       | `meta` of the last successful response (`location`, `flash`, ...)                                          |
| `httpStatus` | Status of the last response                                                                                |
| `message`    | Message of the last `422` or error response                                                                |
| `lastError`  | The last non-validation error, with `kind` as for `useJson`                                                |

Submission options are `headers`, `only`/`except`, `forceFormData`, `resetOnSuccess`, and the callbacks `onBefore` (return `false` to skip), `onStart`, `onProgress`, `onSuccess(result, meta)`, `onInvalid(errors, message)`, `onError(error)`, `onException(error)`, `onCancel` and `onFinish(outcome)`. The promise resolves to the same outcome as `useJson` and never rejects. After a success the submitted values become the new defaults unless `resetOnSuccess` is set.

As with `useJson`, a `419` or `401` is reported, not acted on; one submission runs at a time (a new one cancels the previous); and unmounting the component cancels it (Vue: `cancelOnDispose: false` to opt out). `validate()` uses Precognition in JSON mode, so the route needs the `precognitive` middleware as for page forms. Headers passed to `useJsonForm(data, { headers })` go on every request. Field names may not match a member (`result`, `meta`, `message`, `errors`, ...); see [Reserved field names](/basics/forms#reserved-field-names).

## Caching

Responses are `private, no-cache` with a weak `ETag`; send `If-None-Match` for `304` answers. See [Caching and private data](/security/caching).

## Versioning

JSON mode is your application's API. Version it with your usual tools (URL prefixes, headers, resources). Bridge's protocol version applies to page mode and streams only.

## Authentication

Bridge does not authenticate. Put the shared routes behind `auth:sanctum`: browsers authenticate with the session, other clients with bearer tokens. See [Authentication](/security/authentication) and [CSRF protection](/security/csrf).
