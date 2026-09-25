# Channels and authorization

A channel is a named topic. The server decides which channels a connection subscribes to; publishers name the channels they publish to. Names are opaque strings, conventionally dot-separated: `customers`, `user.42`, `tenant.7.orders`.

## Server-assigned channels

```php
Bridge::stream()->channels(fn (User $user) => [
    'customers',
    "user.{$user->id}",
    ...$user->tenants->map(fn ($t) => "tenant.{$t->id}"),
]);
```

This closure is the authorization: a connection sees only what it returns.

## Client-requested channels

A client may ask for extra channels with `?channels=tenant.7,reports`. Every requested channel must pass a channel authorizer, exactly like Laravel's broadcast channels:

```php
Bridge::channel('tenant.{id}', fn (User $user, string $id) => $user->tenant_id === (int) $id);
Bridge::channel('reports', fn (User $user) => $user->can('viewReports'));
```

If any requested channel is not authorized the stream ends with `error{kind:"forbidden", final:true}` and the client does not reconnect. Requests are capped at 20 channels (`bridge.stream.max_client_channels`) and 190 characters per name.

## Reconnections

Every reconnection is a new HTTP request. It is authenticated and authorized again, and replayed events are filtered by the channels the connection is authorized for now. A user who lost access between connections does not receive the events they missed.

## Guidelines

- Publish data-carrying events (`prop`, application events) only to per-user or per-tenant channels.
- Use `invalidate` on shared channels: it carries no data, and the re-fetch is authorized per user.
- Give models with [watched props](/realtime/watched-props) a `streamOn()` that returns per-tenant channels. Watch tags carry no data, but they do show table names and record keys to every subscriber of the channel.
- Close a user's streams with `Bridge::to("user.{$id}")->end(reason: 'unauthorized')` when their access changes; their next connection is re-authorized.
