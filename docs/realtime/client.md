# The stream client

`useStream` (Vue) and `bridge.stream()` (core, React) open a stream and expose its state.

```ts
const { state, on, lastEventAt, reconnectAttempts, connect, close } = useStream('/events', {
  transport: 'fetch', // or 'eventsource'
  channels: ['tenant.7'], // extra channels, authorized by the server
  autoConnect: true,
  closeOnDispose: true, // Vue: close when the component scope ends
})
```

| Value                 | Meaning                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `state`               | `idle`, `connecting`, `open`, `reconnecting` or `closed`                                                               |
| `on(event, listener)` | Listen to an application event by name, or to `notification`, `progress`, `error`, `end`, `heartbeat`, `state`, or `*` |
| `lastEventAt`         | Timestamp of the last bytes received                                                                                   |
| `reconnectAttempts`   | Consecutive reconnection attempts                                                                                      |

## Transports

- **fetch (default).** Reads the response body as a stream. It can send `Authorization` and custom headers, observes heartbeats, and runs a watchdog that reconnects after 2.5 heartbeat intervals of silence.
- **EventSource.** The browser's native API. It cannot set headers, so it suits cookie sessions only, and it cannot see heartbeats. Use `transport: 'eventsource'` when you want the browser to own reconnection.

## Automatic behaviour

- `invalidate` triggers a coalesced [partial reload](/data/partial-reloads) of the named props; keys not on the current page are ignored.
- `prop` patches the page store when the key exists on the current page.
- `navigate` visits same-origin URLs; other origins are ignored unless `allowExternalNavigate` is set.
- Reconnection uses exponential backoff with jitter (1 s to 30 s, honouring `retry:`), reconnects immediately after an orderly `end`, and stops after `error{final:true}` or a `401`/`403`.
- After a dropped connection the client sends `Last-Event-ID`. If the server could not replay (`ready.replayed` is false) the client reloads the props it shows, so nothing stays stale.
- A stream that is refused repeatedly (throttling, connection cap) backs off instead of looping.

## Tickets for header-less clients

Native `EventSource`, some mobile SSE libraries and `curl` one-liners cannot send a bearer token. Bridge issues short-lived signed URLs instead:

```php
Route::get('/events', [RealtimeController::class, 'events'])->middleware(['bridge.ticket:web', 'auth:sanctum']);

// From an authenticated request:
$url = Bridge::streamTicket('events'); // signed, valid 60 s, bound to the user and route parameters
```

The ticket authenticates one request only and is never a long-lived credential. See [Authentication](/security/authentication).
