# Publishing events

Publish from anywhere: controllers, jobs, listeners, the scheduler. Publishing only writes to the event bus; the stream connections read from it.

```php
use Bridge\Bridge;

Bridge::to('customers')->invalidate(['customers', 'stats']);      // these props are stale
Bridge::to('customers')->invalidate('*');                          // everything on the page
Bridge::to("user.{$id}")->prop('unreadCount', 3);                   // push a small value
Bridge::to("user.{$id}")->prop('items', $item, mode: 'append');     // replace | merge | append | prepend
Bridge::to("user.{$id}")->notify('Saved', 'success');               // notification, levels info|success|warning|error
Bridge::to("user.{$id}")->navigate('/orders/42');                   // server-initiated navigation
Bridge::to("user.{$id}")->progress('import', 0.4, 'Rows 400/1000');
Bridge::to('customers')->event('customer.created', CustomerResource::make($customer)); // application event
Bridge::to("user.{$id}")->end(reason: 'unauthorized');              // close the user's streams
```

`to()` accepts one channel or an array.

## Event classes

Mirror `ShouldBroadcast` with `ShouldStream`; the event is published when dispatched:

```php
class CustomerCreated implements ShouldStream
{
    public function __construct(public Customer $customer) {}

    public function streamOn(): array
    {
        return ['customers'];
    }

    public function toStream(): array
    {
        return [
            StreamMessage::event('customer.created', CustomerResource::make($this->customer)->resolve()),
            StreamMessage::invalidate(['customers']),
        ];
    }
}
```

`toStream()` may return one message or an array.

## Choosing between invalidate, prop and event

- **`invalidate`** carries no data. The browser re-fetches through the normal request, so authorization and serialization happen exactly once, in the controller. Use it for anything shared between users.
- **`prop`** pushes a value straight into the page. Use it on per-user or per-tenant channels for small, frequent values (counters, statuses).
- **Application events** are for things that are not props: toasts, sounds, live logs. Their payload is yours.

## Ordering and delivery

Events on one channel are delivered in publish order. With the Redis and database drivers they are retained briefly (`maxlen`, `retain_minutes`) so reconnecting clients can replay; the `sync` driver delivers only in-process and the `null` driver discards.
