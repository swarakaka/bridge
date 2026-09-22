# Design: an external stream relay

Status: design only (Phase 5). Not implemented.

## Problem

Every open SSE connection occupies a PHP worker. Bridge bounds this (`max_duration`, per-user caps, heartbeats), but at tens of thousands of concurrent users PHP is the wrong process to hold sockets.

## Shape

```
Publishers (Laravel web, jobs, scheduler) ──► Redis Streams (bridge:stream:{channel})
                                                       ▲
Browser/mobile ──► relay (Go or Node) ─── XREAD BLOCK ─┘
                     │
                     └── authenticates with a Laravel-issued ticket
```

- The relay speaks exactly the protocol in `packages/protocol/spec/stream.md`: `ready`, heartbeats, ids from Redis Streams, `Last-Event-ID` replay, `end{max_duration}`.
- Authentication: the client asks Laravel for a ticket (`Bridge::streamTicket()` today produces a signed URL; for the relay it would produce a signed, short-lived JWT-like token carrying user id and authorized channels). The relay verifies the signature with a shared key and never calls Laravel per connection.
- Channel authorization happens in Laravel when the ticket is issued (the ticket lists channels). Live changes in authorization are bounded by `max_duration`, as today.
- Publishing is unchanged: `Bridge::to()`, `ShouldStream`. The Redis driver's key layout and field names are the contract.
- Laravel keeps serving `/events` for small deployments; the relay is opt-in by pointing the client at a different URL and enabling ticket-based auth.

## Open questions

- Ticket format (HMAC vs. Ed25519), rotation, and revocation.
- Whether the relay should also serve HTTP long-polling for networks that break SSE.
- Multi-region Redis Streams replication and cursor semantics across replicas.
