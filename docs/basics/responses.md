# Responses

`Bridge::render()` returns a `PageResponse` that decides its representation when Laravel converts it to an HTTP response. A few fluent methods adjust it:

```php
return Bridge::render('Customers/Show', ['customer' => $resource])
    ->with(['related' => $related])         // add props
    ->withMeta(['section' => 'customers'])  // reserved page metadata, sent to clients
    ->status(201)                           // HTTP status
    ->cache(maxAge: 60, public: true)       // see Caching and private data
    ->lastModified($customer->updated_at)
    ->jsonRoot('customer')                  // JSON mode: make one prop the data root
    ->embed(false)                          // HTML: static shell, the client bootstraps
    ->shell('marketing');                   // HTML: another shell view
```

## What each mode receives

| Mode | Body                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------- |
| HTML | The shell with the page embedded (`bridge.shell.embed`, default on)                                       |
| Page | The page object: `protocol`, `type`, `component`, `url`, `props`, `build`, optional `deferred` and `meta` |
| JSON | `{ "data": props, "meta"?: {…} }` with Laravel-native shapes                                              |

## Non-page responses

Anything else a controller returns (a `JsonResponse`, a file download, a plain view) passes through untouched. Bridge only represents `Bridge::render()`, `Bridge::redirect()`, `Bridge::stream()` and exceptions.
