# Streams

A stream is a long-lived `text/event-stream` response over which the server pushes events to the browser. Bridge's default pattern is **invalidate-first**: the server says which props are stale and the client re-fetches them through the ordinary, authorized page request. Data-carrying events exist for the cases that need them.

## Define a stream route

```php
Route::get('/events', fn () => Bridge::stream()->channels(fn ($user) => ['customers', "user.{$user->id}"]))
    ->middleware(['auth:sanctum', 'throttle:bridge-stream']);
```

The closure decides the channels for this connection; the client cannot widen them (see [Channels and authorization](/realtime/channels)). The route answers only `Accept: text/event-stream`; anything else gets `406`.

## Subscribe in a page or layout

::: code-group

```vue [Vue]
<script setup lang="ts">
import { useStream } from '@swarakaka/bridge-vue'

const { state, on } = useStream('/events')
on('customer.created', (customer) => console.log(customer))
on('notification', (n) => toast(n.message, n.level))
</script>
```

```ts [React (core API)]
import { getBridge } from '@swarakaka/bridge-react'

const stream = getBridge().stream('/events')
stream.on('notification', (n) => toast(n.message, n.level))
```

:::

`invalidate`, `prop` and `navigate` control events are applied to the page automatically. Everything else reaches your listeners. Put the subscription in a persistent layout so one connection serves the whole session.

## Publish

```php
Bridge::to('customers')->invalidate(['customers']);
```

See [Publishing events](/realtime/publishing) for the full vocabulary.

## Lifecycle

1. The connection is authenticated and authorized like any request.
2. The server sends `ready` (protocol version, whether missed events were replayed, heartbeat and maximum duration). The subscription is live from this point.
3. Events flow; `: hb` comments keep the connection alive during silence.
4. After `max_duration_s` the server sends `end{reconnect:true}` and closes; the client reconnects immediately with `Last-Event-ID` and receives what it missed. Users notice nothing, and PHP workers recycle.

::: tip A subscription is live once `ready` has been sent
Events published between the connection request and `ready` are not part of the subscription unless the client reconnects with a `Last-Event-ID`. Tests and load generators should treat `ready` as the "subscribed" signal.
:::

## One-off producer streams

A controller can also stream the progress of a single operation:

```php
Route::post('/export', fn () => Bridge::stream(function (StreamWriter $s) {
    $s->progress('export', 0.5, 'Halfway');
    $s->emit('export.done', ['rows' => 10]);
}));
```

The stream ends when the closure returns.
