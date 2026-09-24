# Once props

Some props rarely change: a list of plans, countries, translations, feature flags. Resolved as ordinary props, they are queried, serialized and sent on every visit. A once prop is sent to a client the first time and then reused by it, so later visits skip both the server work and the payload.

```php
return Bridge::render('Customers/Create', [
    'statuses' => Bridge::once(fn () => CustomerStatus::options()),
]);
```

Nothing changes in the page component: the prop is always there when it renders.

## How it works

1. The first page that has the prop sends the value and lists it in the page's `meta.once` with a key (the prop name by default) and an expiry.
2. The client keeps the value in memory and lists the key in `X-Bridge-Once` on later page requests.
3. The server sees the key and leaves the value out, without running the closure. The page still lists the prop in `meta.once`.
4. The client fills the value in before the page renders. History entries and `onSuccess` callbacks get the complete page.

A full document load starts with an empty store. The HTML shell always carries every value.

## Sharing a value

Give the same key to props that hold the same data, on one page or across pages:

```php
// CustomerController@create and CustomerController@edit
'statuses' => Bridge::once(fn () => CustomerStatus::options(), key: 'customer-statuses'),
```

After the create form, the edit form gets the list from the client. Keys cannot contain commas or whitespace.

Once props also work as [shared data](/basics/shared-data), which suits values every page needs:

```php
Bridge::share('translations', Bridge::once(fn () => __('app'), key: 'translations.'.app()->getLocale()));
```

Putting the locale in the key makes a language switch fetch the new translations.

## Expiry and refresh

```php
Bridge::once(fn () => Plan::all(), ttl: 3600);                  // seconds
Bridge::once(fn () => Plan::all(), ttl: new DateInterval('PT1H'));
```

Once a value expires, the client stops announcing it and the next page sends it again. Without a `ttl` it lasts until the tab is reloaded or the store is cleared.

To send a new value before then:

- `->fresh()` sends it even to clients that hold it, for example right after an admin edited the plans: `Bridge::once(...)->fresh($plansChanged)`.
- A reload naming the prop always resolves it: `router.reload({ only: ['plans'] })`. A stream `invalidate` naming the prop does the same: `Bridge::to('plans')->invalidate(['plans'])` refreshes it in every tab subscribed to that channel that shows the prop. `invalidate('*')` reloads without naming it, so held values stay.

## When values are forgotten

The client keeps once values for the tab, in memory only, and drops them all when:

- the router receives `401`, `403` or `419` (the user or their permissions changed);
- a page clears history ([history encryption](/security/history-encryption), on logout by default);
- you call `router.clearCache()`.

Mutations and ordinary reloads keep them. If the client lost a value while a response that left it out was on its way, it requests the prop with a partial reload.

## Rules

- To keep a deferred or lazy prop once, chain the modifier instead of wrapping: `Bridge::defer(fn () => ...)->once()` (see [Combining hints](/data/deferred-props#combining-hints)). `Bridge::once()` cannot wrap another hint, a hint cannot resolve to one, `always()` takes no modifier, and a prop cannot be both `once` and `merge`.
- A partial reload lists only the once props it selected.
- JSON mode resolves once props like plain props and ignores `X-Bridge-Once`: JSON clients have no page store to fill from.
- Page responses carry `X-Bridge-Once` in `Vary`.

The wire format is `packages/protocol/spec/page.md` §11.
