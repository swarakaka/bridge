# Caching

Defaults are conservative because most Bridge responses are private:

| Mode                                | Default                                | Notes                                   |
| ----------------------------------- | -------------------------------------- | --------------------------------------- |
| Page                                | `private, no-cache` + weak `ETag`      | `If-None-Match` → `304` saves bandwidth |
| JSON                                | `private, no-cache` + weak `ETag`      | same                                    |
| HTML shell, embedded, authenticated | `private, no-store`                    | page data is in the document            |
| HTML shell, embedded, guest         | `private, no-cache` + `ETag`           |                                         |
| HTML shell, static                  | `public, max-age=300, must-revalidate` | `bridge.shell.embed = false`            |
| Stream                              | `no-cache, no-transform`               | never cacheable                         |

Every page and JSON response carries `Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component`.

Opt in per response:

```php
return Bridge::render('Public/Post', [...])->cache(maxAge: 60, public: true)->lastModified($post->updated_at);
```

`public` is refused for responses produced for an authenticated user unless `force: true`. Keep public caching off unless your CDN keys on `Accept`.

Client side, prefetched pages live in a short in-memory cache (30 s fresh, 30 s stale-while-revalidate) that is cleared after mutations, logout-like errors and build conflicts.
