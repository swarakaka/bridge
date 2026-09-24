# Optimistic updates

An optimistic update shows the expected result of a request before the server answers, and undoes it if the server refuses. Return the top-level page props to change; they are shallow-merged into the current props at once.

::: code-group

```vue [Vue]
<script setup lang="ts">
import { router, usePage } from '@swarakaka/bridge-vue'

const { props } = usePage<{ post: { id: number; likes: number } }>()

const like = () =>
  router
    .optimistic(() => ({ post: { ...props.value.post, likes: props.value.post.likes + 1 } }))
    .post(`/posts/${props.value.post.id}/like`, {}, { preserveState: true, preserveScroll: true })
</script>
```

```tsx [React]
import { router } from '@swarakaka/bridge-core'
import { usePage } from '@swarakaka/bridge-react'

export function Like() {
  const { props } = usePage<{ post: { id: number; likes: number } }>()
  const like = () =>
    router
      .optimistic(() => ({ post: { ...props.post, likes: props.post.likes + 1 } }))
      .post(`/posts/${props.post.id}/like`, {}, { preserveState: true })
  return <button onClick={like}>♥ {props.post.likes}</button>
}
```

:::

The same callback can be passed as the `optimistic` visit option. Forms take it for their next submission, with the form data as the second argument:

```ts
form
  .optimistic((props, data) => ({
    comments: [...(props.comments as Comment[]), { body: data.body }],
  }))
  .post('/comments')
```

`<BridgeForm :optimistic="(props, data) => ({ … })">` applies it to every submission. See [Form component](/basics/form-component).

## What happens

- **Failure** (validation error, other error response, network failure, or a visit cancelled by a newer one): the changed props show the server's values again.
- **Success with a page** (a page visit, usually after a redirect): the page's props replace the optimistic values.
- **Success without a page** (a JSON form, or a `204`): the optimistic values stay. Reconcile them with the response if needed: `router.patchProps({ post: result.post })`, a stream invalidation, or `router.reload({ only: ['post'] })`.

Only the props the callback returns are tracked. While a prop is held by a pending update, server data for it (another visit's page, a partial reload, a stream `prop` event, `router.patchProps`) is remembered but not shown; once the last update holding it settles, the latest server value (or the successful page's value) appears. When two updates overlap on one prop, a failure of the older one leaves the newer value on screen.

Optimistic values are never written to history state, so back and forward never restore an unconfirmed value, and navigating to another page drops pending updates.

## Rapid clicks

Page visits cancel each other: a second like before the first answered cancels the first request and keeps the newest value on screen, so the count shown is right but only the last request reaches the server. When every click must reach the server, use a [JSON form](/beyond/json-mode#forms-over-json-usejsonform), which runs beside visits:

```ts
import { router, useJsonForm } from '@swarakaka/bridge-vue'

const like = useJsonForm<Record<string, never>, { likes: number }>({})

const click = () =>
  like
    .optimistic((props) => ({ likes: (props.likes as number) + 1 }))
    .post(`/posts/${id}/like`, {
      onSuccess: (result) => result && router.patchProps({ likes: result.likes }),
    })
```

A JSON form still runs one request at a time; create one per concurrent action, or accept that a new click cancels the previous request.
