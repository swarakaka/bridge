# Caching and private data

Defaults are conservative because most Bridge responses are private:

| Mode                                | Default                                 | Notes                         |
| ----------------------------------- | --------------------------------------- | ----------------------------- |
| Page                                | `private, no-cache` + weak `ETag`       | `If-None-Match` answers `304` |
| JSON                                | `private, no-cache` + weak `ETag`       | same                          |
| HTML shell, embedded, authenticated | `private, no-store`                     | page data is in the document  |
| HTML shell, embedded, guest         | `private, no-cache` + `ETag`            |                               |
| HTML shell, static, guest           | `public, max-age=300, must-revalidate`  | `bridge.shell.embed = false`  |
| HTML shell, static, authenticated   | `private, max-age=300, must-revalidate` | `bridge.shell.embed = false`  |
| Stream                              | `no-cache, no-transform`                | never cacheable               |

Every page and JSON response carries `Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component`, so a cache can never serve a page object to a browser navigation or a partial response as a full one.

## Opting in

```php
return Bridge::render('Public/Post', [...])
    ->cache(maxAge: 60, public: true)
    ->lastModified($post->updated_at);
```

`public` is refused for responses produced for an authenticated user unless `force: true`. Keep public caching off unless your CDN keys on `Accept`.

## Client cache

Prefetched pages live in a short in-memory cache (30 s fresh, 30 s stale-while-revalidate) that is cleared after mutations, after `401`, `403` and `409` responses and on build conflicts. It never persists beyond the tab.

## Other controls

- `X-Bridge-Location` is emitted only for app-controlled redirects; the client follows other origins only with `allowExternalNavigate`.
- Page and stream errors never carry stack traces. JSON mode includes them only with `app.debug`.
- The full review, with evidence per control, is in the repository at `development/security-review.md`.
