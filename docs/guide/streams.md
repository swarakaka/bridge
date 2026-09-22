# Real-time streams

Streams are server-sent events with a small control vocabulary. The default pattern is **invalidate-first**: the server tells clients which props are stale and the client re-fetches them through the ordinary, authorized request path.

## Server

```php
// One stream per user
Route::get('/events', fn () => Bridge::stream()->channels(fn ($user) => ['customers', "user.{$user->id}"]))
    ->middleware(['auth:sanctum', 'throttle:bridge-stream']);

// Publish from anywhere
Bridge::to('customers')->invalidate(['customers']);
Bridge::to("user.{$id}")->notify('Saved', 'success');
Bridge::to("user.{$id}")->prop('unreadCount', 3);
Bridge::to('customers')->event('customer.created', CustomerResource::make($customer));

// Or mark an event class
class CustomerCreated implements ShouldStream
{
    public function streamOn(): array { return ['customers']; }
    public function toStream(): array
    {
        return [StreamMessage::event('customer.created', [...]), StreamMessage::invalidate(['customers'])];
    }
}

// Authorize client-requested channels (?channels=tenant.7)
Bridge::channel('tenant.{id}', fn (User $user, string $id) => $user->tenant_id === (int) $id);

// One-off producer
Route::post('/export', fn () => Bridge::stream(function (StreamWriter $s) {
    $s->progress('export', 0.5, 'Halfway');
    $s->emit('export.done', ['rows' => 10]);
}));
```

Control events: `ready`, `invalidate`, `prop`, `notification`, `navigate`, `progress`, `error`, `end`. Heartbeats are `: hb` comment lines. Connections end after `max_duration_s` with `end{reconnect:true}` and the client reconnects with `Last-Event-ID`.

::: tip A subscription is live once `ready` has been sent
Events published between the connection request and the `ready` event are not part of the subscription unless the client reconnects with a `Last-Event-ID`. Clients (and load tests) should treat `ready` as the "subscribed" signal.
:::

## Client

```ts
const { state, on, lastEventAt, reconnectAttempts, close } = useStream('/events')
on('customer.created', (payload) => ...)
on('notification', (n) => toast(n.message, n.level))
```

`invalidate`, `prop` and `navigate` are applied to the page automatically. The default transport is fetch-based so it can send `Authorization`; `transport: 'eventsource'` uses the native API for cookie sessions. Reconnection uses exponential backoff with jitter, honours `retry:`, reconnects immediately after an orderly `end`, resyncs after a dropped connection the server could not replay, and stops after a final error or a 401/403.

## Tickets for header-less clients

```php
Route::get('/events/ticket', [RealtimeController::class, 'events'])->middleware(['bridge.ticket:web', 'auth:sanctum']);
$url = Bridge::streamTicket('events.ticket'); // signed, 60 s, bound to the user
```

## Bus drivers

`redis` (Redis Streams, replay, recommended), `database` (polling, no Redis, run `bridge:stream:prune`), `sync` (tests), `null`. See [Deploying streams](/guide/streams-deployment).
