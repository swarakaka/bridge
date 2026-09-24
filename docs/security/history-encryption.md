# History encryption

To restore a page on back/forward without a request, the client keeps each page object, its props and any [remembered state](/advanced/remembering-state) in the browser's session history. After the user signs out, that copy stays in the browser: pressing back would show the previous user's pages without asking the server, and the data survives in the browser's tab and session restore files.

History encryption keeps those entries encrypted, and clearing history makes every earlier entry unreadable.

## Encrypting pages

Turn it on for every page:

```php
// config/bridge.php
'history' => [
    'encrypt' => true, // or BRIDGE_HISTORY_ENCRYPT=true
],
```

or only for some routes, usually everything behind authentication:

```php
Route::middleware(['auth', 'bridge.encrypt-history'])->group(function () {
    // ...
});
```

Per request and per response:

```php
Bridge::encryptHistory();                                  // this request's pages

return Bridge::render('Billing/Invoice', [...])->encryptHistory();

Route::get('/help', ...)->middleware('bridge.encrypt-history:false'); // opt out inside a group
```

A response's own choice wins over the request's, and the request's wins over the config.

## Clearing history

```php
Bridge::clearHistory();
```

The next page this client receives tells it to replace its key. Entries encrypted before can no longer be decrypted, so going back to one requests it from the server again, which applies authentication as usual. Pages the client prefetched are dropped too.

When `clearHistory()` is called on a request that ends in a redirect, it is saved in the session after your controller has run and delivered with the next page. That covers the usual logout, which invalidates the session and then redirects.

You rarely need to call it yourself: with `history.clear_on_logout` (default `true`), Bridge calls it on Laravel's `Logout` event, so Fortify, Breeze and your own logout actions all clear history.

## How the client stores entries

- An encrypted entry is sealed with AES-GCM (256-bit key, fresh IV per write) through the browser's Web Crypto API. Its page and remembered state are sealed; scroll positions stay in clear, since they carry no application data.
- The key lives in `sessionStorage`, never in the history entry, and ends with the tab's session.
- Clearing replaces the key in this tab and bumps a counter in `localStorage` so the site's other open tabs replace theirs before they decrypt anything.
- A page restored from the browser's back-forward cache after its key was replaced is reloaded.
- Nothing changes for pages without the flag, and JSON mode is not affected.

## Requirements and limits

- Web Crypto works only in a secure context: HTTPS, or `localhost`/`127.0.0.1` during development. Without it, encrypted pages are stored without their page and remembered state, never in clear, and back/forward requests them again. The console shows one warning.
- After a full reload, remembered state of an encrypted page (`useRemember`, form `remember`) is restored a moment after the page appears, once the entry is decrypted. A value the user changed in the meantime is kept. Code that reads `router.restore()` itself can listen for the `restore` [event](/advanced/events).
- This protects Bridge's own copies. The browser's HTTP cache is covered by `Cache-Control: private, no-store` on authenticated HTML shells (see [Caching and private data](/security/caching)); data your application writes elsewhere (its own `localStorage`, a service worker cache) is yours to clear.

The wire format (`meta.encryptHistory`, `meta.clearHistory`) is defined in `packages/protocol/spec/page.md` §10.
