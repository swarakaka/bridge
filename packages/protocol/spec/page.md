# Page mode

Page mode is used by client adapters (Vue, React, …) to navigate without full document loads. It is selected by `Accept: application/vnd.bridge+json; v=1`.

## 1. Page object

A successful page response has status `200` and body:

```jsonc
{
  "protocol": 1,
  "type": "page",
  "component": "Customers/Index",
  "url": "/customers?page=2",
  "props": { "...": "..." },
  "build": "3f9c1a",
  "deferred": { "default": ["stats"] },
  "meta": {},
}
```

| Field       | Type           | Required | Meaning                                                                                                                                                                                                 |
| ----------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol`  | integer        | yes      | Protocol version of this document. Equals the `v` of the response media type.                                                                                                                           |
| `type`      | `"page"`       | yes      | Discriminator.                                                                                                                                                                                          |
| `component` | string         | yes      | Opaque component name. Clients resolve it however they like; servers MUST NOT assume a file format.                                                                                                     |
| `url`       | string         | yes      | Path plus query (no origin) of the request as the server routed it. Clients push this to history.                                                                                                       |
| `props`     | object         | yes      | The prop bag. Always an object, possibly empty. Includes shared props.                                                                                                                                  |
| `build`     | string \| null | yes      | Current asset build identifier, or `null` when the server has none configured.                                                                                                                          |
| `deferred`  | object         | no       | Map of group name → array of prop keys that are absent from `props` and SHOULD be requested after render (§4). Omitted or empty when nothing is deferred.                                               |
| `meta`      | object         | no       | Additive extensions. Clients MUST ignore unknown members. Defined members: `merge`, `prepend`, `deepMerge` and `matchOn` (§3), `encryptHistory` and `clearHistory` (§10), `once` (§11), `scroll` (§12). |

Clients MUST ignore unknown top-level members. Servers MUST NOT emit members not defined here or in a later version of this specification.

The schema is `schemas/page.schema.json`.

## 2. HTML shell and embedded page

A request negotiated as `html` returns an HTML document. When the server embeds the initial page (the default), the document MUST contain:

```html
<script type="application/json" id="bridge-page">
  { ...page object... }
</script>
```

The JSON MUST be escaped so that `</script` cannot terminate the element (encode `<` as the six-character sequence backslash, `u003c`). The element id `bridge-page` is normative. The shell MAY also contain `<meta name="bridge-protocol" content="1">` and `<meta name="bridge-build" content="…">`.

When the shell does not embed a page (static-shell mode), the client MUST issue a page request for `location.pathname + location.search` on start-up.

## 3. Partial responses

A request carrying `X-Bridge-Only` or `X-Bridge-Except` (see [headers.md](headers.md)) receives a page object whose `props` contain only the selected keys plus any `always` props. `component`, `url`, `build`, and `protocol` are still present.

Rules:

- The server MUST evaluate `X-Bridge-Component`; on mismatch it MUST ignore the selection and return a full page.
- The client MUST merge a partial response into the current page only when `component` equals the current component; otherwise it MUST treat the response as a full page swap.
- Merging replaces each returned key wholesale. Keys listed in a merge member (below) MAY instead be combined with the current value when the client opted in for that request, e.g. "load more". Requests that did not opt in, including invalidation reloads, replace the key.

Merge members of `meta`, each listing a key at most once across the three lists:

| Member      | Type                         | Combination                                                                                                                                                                    |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `merge`     | array of keys                | Append: arrays concatenate; objects concatenate their array members (a paginator's `data`) and take the other members from the response.                                       |
| `prepend`   | array of keys                | As `merge`, with incoming items placed before the current ones.                                                                                                                |
| `deepMerge` | array of keys                | Objects merge key by key at every depth; arrays at any depth concatenate (append); any other value, or a type mismatch, takes the incoming value.                              |
| `matchOn`   | object: key → array of paths | Match paths for keys in the three lists. The last segment of a path is the item key; the others lead to an array inside the prop (`id` for a list, `data.id` for a paginator). |

When a match path points at an array being concatenated, an incoming item whose item key equals an existing item's replaces that item in place and is not added again; items without a match are added at the list's end (or start, for `prepend`). Paths contain no commas or whitespace.

A client MAY let a request override the combination for every listed key (for example to prepend a page loaded above the current ones). Clients that do not know `prepend` or `deepMerge` replace those keys.

- Lazy props (§4) are included only when named in `X-Bridge-Only`.

## 4. Lazy, deferred, always

Servers may mark props with delivery hints. The hints are not visible on the wire except through their effects:

| Hint     | Full page request                         | Partial request naming the key | Effect on wire    |
| -------- | ----------------------------------------- | ------------------------------ | ----------------- |
| lazy     | excluded                                  | included                       | key simply absent |
| deferred | excluded; key listed in `deferred[group]` | included                       | `deferred` member |
| always   | included                                  | included even if not named     | key present       |
| once     | included unless held (§11)                | included                       | `meta.once` entry |

After rendering a page with a non-empty `deferred`, the client SHOULD issue one partial request per group with `X-Bridge-Only: <keys of group>` and `X-Bridge-Component: <component>`, in parallel, and abort them if the user navigates away.

### 4.1 Combinations

A prop has one delivery (plain, lazy, deferred or always) and may add merge (§3) and once (§11); always takes neither, and a prop is never both merge and once. The server applies selection, then the delivery, then once, then merge:

| Prop             | Full page request, value not held          | Full page request, key held (§11)                     | Partial request naming the key       |
| ---------------- | ------------------------------------------ | ----------------------------------------------------- | ------------------------------------ |
| deferred + once  | listed in `deferred`; no `meta.once` entry | absent from `props` and `deferred`; `meta.once` entry | included; `meta.once` entry          |
| lazy + once      | absent; no `meta.once` entry               | absent; `meta.once` entry                             | included; `meta.once` entry          |
| deferred + merge | listed in `deferred`; no merge member      | —                                                     | included; listed in its merge member |
| lazy + merge     | absent                                     | —                                                     | included; listed in its merge member |

A `meta.once` entry for an absent value tells the client to fill it from its store, so a held deferred-once prop causes no deferred request. A once prop marked fresh by the application is treated as not held.

## 5. Build conflicts

If a **GET** page request carries `X-Bridge-Build` and it differs from the server's current build, the server MUST respond:

```
HTTP/1.1 409 Conflict
X-Bridge-Location: /customers?page=2
```

with an empty body. The client MUST perform a full document navigation to `X-Bridge-Location`. Requests without `X-Bridge-Build` are never rejected for this reason.

## 6. Redirects

- Same-origin redirects use `303 See Other` with `Location` for every method (so that a POST is followed by a GET). Clients follow them with the page `Accept` header; the final response is an ordinary page object and its `url` is authoritative for history.
- Redirects to another origin MUST be represented as `409 Conflict` with `X-Bridge-Location` (browsers do not expose cross-origin redirect targets to `fetch`).

## 7. Caching defaults

| Situation                                     | `Cache-Control`                         | Other                                                     |
| --------------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| page response                                 | `private, no-cache`                     | weak `ETag` over the body; `304` on `If-None-Match` match |
| html shell, embedded page, authenticated user | `private, no-store`                     | —                                                         |
| html shell, embedded page, guest              | `private, no-cache`                     | weak `ETag`                                               |
| html shell, static (no embedded page), guest  | `public, max-age=300, must-revalidate`  | `ETag`                                                    |
| html shell, static, authenticated user        | `private, max-age=300, must-revalidate` | `ETag`                                                    |

Applications MAY relax these per response. A server MUST NOT emit `public` for a response produced for an authenticated user unless the application explicitly forces it.

## 8. Errors

Non-2xx responses in page mode carry the Bridge error object defined in [errors.md](errors.md), with the media type `application/vnd.bridge+json; v=1`.

## 9. Non-Bridge responses

If a client receives a response to a page request whose `Content-Type` is not `application/vnd.bridge+json` (for example an HTML login page produced by a proxy), it MUST NOT attempt to interpret the body as a page. The recommended behaviour is to surface the response to the application (debug) or perform a full document reload (production).

## 10. History

Clients that keep page objects in the browser's session history (so back/forward can restore a page without a request) store the props with them. Two `meta` members let the server protect that copy.

| Member           | Type    | Meaning                                                                                                   |
| ---------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `encryptHistory` | boolean | When `true`, the client SHOULD store this page, and any per-entry state it keeps with it, encrypted.      |
| `clearHistory`   | boolean | When `true`, the client SHOULD make every entry it encrypted earlier unreadable before storing this page. |

Servers omit both members when they are not `true`. Both MAY appear on any page object, including one embedded in an HTML shell and a partial response.

Client obligations:

- An encrypted entry is sealed with a key that is not stored in the history entry itself and that does not outlive the browser tab's session. Only data that carries no application state (such as scroll positions) MAY stay in clear.
- If an entry cannot be decrypted (the key is gone or was replaced, or the data does not authenticate), the client MUST treat it as holding no page and request the URL from the server, which applies authentication again.
- If encryption is not available (for example outside a secure context), the client MUST NOT store an entry marked `encryptHistory` in clear; it stores the entry without its page.
- `clearHistory` replaces the key. A client SHOULD also make other browsing contexts of the same origin replace theirs, and SHOULD drop cached page objects.

A server that asks for `clearHistory` on a response that is a redirect (for example after logging a user out) SHOULD carry the request over to the next page object it returns to that client (typically through the session).

## 11. Once props

A once prop is sent to a client once and then reused by it until it expires, for values that rarely change (plan lists, countries, translations).

The page object lists every once prop it considered in `meta.once`, whether or not the value is in `props`:

```jsonc
"meta": {
  "once": {
    "plans": { "key": "plans", "expiresAt": null },
    "statuses": { "key": "customer-statuses", "expiresAt": 1790000000000 },
  },
}
```

| Member      | Type           | Meaning                                                                                                    |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `key`       | string         | The once key: the prop name unless the server chose another, so several props or pages can share a value.  |
| `expiresAt` | integer / null | When a value sent with this response stops being reusable, in milliseconds since the epoch; `null`: never. |

Keys contain no commas or whitespace.

Rules:

- A client that keeps once values sends the keys it holds and considers unexpired in `X-Bridge-Once` on page requests ([headers.md](headers.md)).
- For a once prop whose key is listed, the server omits the value from `props` and keeps the `meta.once` entry, unless the prop is named in `X-Bridge-Only` (an explicit reload is a refresh) or the application forces a fresh value.
- When a value is present in `props`, the client stores it under its key with that `expiresAt`. When it is absent and listed, the client fills it from its store before rendering; it MUST NOT extend a stored expiry from a response that did not carry the value. If it has nothing to fill, it requests the prop with a partial reload.
- A partial response lists only the once props it selected.
- JSON mode resolves once props like plain props and ignores `X-Bridge-Once`. An HTML shell's embedded page always carries the values.
- Once values can be user-specific: a client drops its stored values when it clears history (§10) and when it receives `401`, `403` or `419`.

## 12. Scroll props

A scroll prop is a paginated list the client extends page by page as the user scrolls ("infinite scroll"). It is an append merge prop (§3), usually with a match path on `data.id`, and the page describes its ends in `meta.scroll`:

```jsonc
"meta": {
  "merge": ["customers"],
  "matchOn": { "customers": ["data.id"] },
  "scroll": {
    "customers": { "pageName": "page", "dataPath": "data", "currentPage": 3, "previousPage": 2, "nextPage": 4 },
  },
}
```

| Member         | Type                    | Meaning                                                                                          |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `pageName`     | string                  | Query parameter selecting a page (`page`, or the cursor parameter).                              |
| `dataPath`     | string                  | Dotted path of the item list inside the prop.                                                    |
| `currentPage`  | integer / string / null | The page in this response: a page number, or a cursor string (`null` for the first cursor page). |
| `previousPage` | integer / string / null | The page before it, or `null` at the start.                                                      |
| `nextPage`     | integer / string / null | The page after it, or `null` at the end.                                                         |

A client loads the next page by requesting the current URL with `pageName` set to `nextPage`, `X-Bridge-Only` naming the prop, and appending; the previous page likewise with `previousPage`, prepending. The entry describes only the page in the response: the client keeps the outer ends of what it has loaded itself. JSON mode leaves `meta.scroll` out.
