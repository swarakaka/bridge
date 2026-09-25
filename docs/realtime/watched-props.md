# Watched props

A watched prop says which data it is built from. When that data changes, every open page showing the prop reloads it over its [stream](/realtime/streams), without you publishing anything by hand.

```php
use App\Models\Customer;
use Bridge\Bridge;

return Bridge::render('Customers/Show', [
    // Reloads when this customer changes.
    'customer' => Bridge::watch(CustomerResource::make($customer), $customer),
    // Reloads when any customer changes.
    'recent' => Bridge::watch(fn () => CustomerResource::collection(Customer::latest()->limit(5)->get()), Customer::class),
]);
```

```php
use Bridge\Stream\Concerns\StreamsChanges;

class Customer extends Model
{
    use StreamsChanges;

    public function streamOn(): array
    {
        return ["tenant.{$this->tenant_id}"];
    }
}
```

Nothing changes in the page component. The browser needs an open stream that applies control events (the default for [`useStream`](/realtime/client)) and subscribes to the channels the model publishes on.

## Compared with invalidate

With [`invalidate`](/realtime/publishing), the publisher names the props: `Bridge::to('customers')->invalidate(['customers', 'stats', 'recentCustomers'])`. Every page that shows customers must be listed there, and a new page stays stale until someone adds its key.

A watched prop turns this around. The prop names its sources, the model reports what changed, and each browser works out which of its own props are affected. The server keeps no record of who is viewing what.

## Sources

`Bridge::watch($value, ...$sources)` is a plain prop. `->watch(...$sources)` adds the same to any other prop, and it combines with every delivery and modifier:

```php
Bridge::defer(fn () => $stats(), 'charts')->watch(Order::class);
Bridge::lazy(fn () => $activity($customer))->watch($customer);
Bridge::scroll($paginator)->watch(Customer::class);
Bridge::once(fn () => Plan::all(), key: 'plans')->watch(Plan::class);
Bridge::always($user)->watch($user);
```

A source is one of:

| Source                           | Tag            | Reloads when                                  |
| -------------------------------- | -------------- | --------------------------------------------- |
| a model class: `Customer::class` | `customers`    | any customer changes                          |
| a model: `$customer`             | `customers.12` | this customer changes                         |
| a string: `'reports'`            | `reports`      | you [touch](#changes-without-model-events) it |

Several sources may be listed. A deferred, lazy or infinite-scroll prop reloads the way it normally loads (an infinite-scroll list fetches its loaded pages again), and a once prop gets a fresh value.

## Tags

A tag links a change to a prop. It is sent to the browser in the page's `meta.watch` and in stream messages. It never grants access: the reload goes through your controller and its policies like any partial reload.

By default a model's tag is its table name. `config/bridge.php` can use the morph class instead:

```php
'watch' => [
    'tags' => 'class', // 'table' (default) or 'class'
],
```

With `class`, the tag is the morph-map alias when one is registered (`customer.12`), otherwise the class name (`App\Models\Customer.12`). Register a morph map if you do not want class names in the browser. A model can also choose its own tag:

```php
public function bridgeTag(): string
{
    return 'clients';
}
```

Tags cannot contain `*`, `,` or whitespace.

## Publishing changes

`StreamsChanges` records a change when a model is created, updated, deleted or restored. Saving a model that did not change records nothing. Changes are not published one by one:

- A change inside a database transaction is published after the transaction commits, and dropped if it rolls back, so a reload never reads the data from before the commit.
- Changes are published when the request ends (after the response), after each queued job, and when an Artisan command finishes. There is one message per channel, however many records changed.
- Beyond 50 changed records of one model (`watch.max_tags`), a message says "some customers changed" (`customers.*`) instead of listing them. Every prop watching customers or one customer then reloads.

### Channels

`streamOn()` returns the channels a model's changes go to. Without it, changes go to `watch.channels` (default `['bridge.watch']`), which every subscriber of that channel receives. In a multi-tenant app, define `streamOn()` so one tenant's changes never reach another's pages. `php artisan bridge:doctor` lists the models that use the default channels.

The stream route must subscribe to those channels:

```php
Route::get('/events', fn () => Bridge::stream()->channels(fn ($user) => [
    "tenant.{$user->tenant_id}",
]))->middleware('auth');
```

### Changes without model events

Mass updates, raw queries and external systems fire no model events. Report them with `touch()`:

```php
Customer::query()->where('status', 'trial')->update(['status' => 'active']);

Bridge::to("tenant.{$tenantId}")->touch('customers.*'); // some customers changed
Bridge::to("tenant.{$tenantId}")->touch(Customer::class); // props watching Customer::class
Bridge::to("tenant.{$tenantId}")->touch($customer);       // this customer
Bridge::to('reports')->touch('reports');                  // a string tag
```

`touch()` is buffered like model changes. Note that `touch(Customer::class)` reloads props watching the class but not props watching one customer; use `'customers.*'` after changing records in bulk.

Eloquent's `$touches` saves the parent models too, so a changed `Contact` can reload props watching its `Customer`.

## The tab that made the change

A tab that saves a customer already shows the result: its visit was redirected to a fresh page. Bridge does not reload that tab a second time.

Every request a client sends carries `X-Bridge-Client: <token>.<number>`, where the token is random and new for each page load. The server publishes a hash of the token and the request number with the change. The tab recognises its own change and skips the props that response (or a later one) delivered. It still reloads props its request did not deliver, for example after a `useJsonForm` save or a `204`. The token itself is never published, so other subscribers cannot pass for the tab.

Changes made in queued jobs carry no request number: a job can finish after the tab's response, so every tab reloads.

## Many open pages

One change makes every other page watching it reload at the same moment. To spread the requests on busy apps, delay them by a random time:

```js
createBridgeApp({ watchSpread: 500 }) // up to 500 ms
```

The reloads are ordinary partial requests, so your rate limits and caching apply.

## Without a stream

A watched prop does nothing without an open stream. The browser console warns when a page with watched props shows and no stream applying control events is open. The page still works; it simply does not update.

## What is not watched

- Queries are not inspected. A prop watches only the sources you name, which also covers records created after the page loaded.
- JSON mode leaves `meta.watch` out.
- Relations: use `$touches` or `touch()`.
