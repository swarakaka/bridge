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

| Field       | Type           | Required | Meaning                                                                                                                                                   |
| ----------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol`  | integer        | yes      | Protocol version of this document. Equals the `v` of the response media type.                                                                             |
| `type`      | `"page"`       | yes      | Discriminator.                                                                                                                                            |
| `component` | string         | yes      | Opaque component name. Clients resolve it however they like; servers MUST NOT assume a file format.                                                       |
| `url`       | string         | yes      | Path plus query (no origin) of the request as the server routed it. Clients push this to history.                                                         |
| `props`     | object         | yes      | The prop bag. Always an object, possibly empty. Includes shared props.                                                                                    |
| `build`     | string \| null | yes      | Current asset build identifier, or `null` when the server has none configured.                                                                            |
| `deferred`  | object         | no       | Map of group name → array of prop keys that are absent from `props` and SHOULD be requested after render (§4). Omitted or empty when nothing is deferred. |
| `meta`      | object         | no       | Reserved for additive extensions. Clients MUST ignore unknown members.                                                                                    |

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
- Merging replaces each returned key wholesale (no deep merge). Keys listed in `meta.merge` MAY instead be appended (arrays concatenate; objects with array members such as paginators concatenate those members and take the other members from the response) when the client opted in for that request, e.g. "load more". Requests that did not opt in, including invalidation reloads, replace the key.
- Lazy props (§4) are included only when named in `X-Bridge-Only`.

## 4. Lazy, deferred, always

Servers may mark props with delivery hints. The hints are not visible on the wire except through their effects:

| Hint     | Full page request                         | Partial request naming the key | Effect on wire    |
| -------- | ----------------------------------------- | ------------------------------ | ----------------- |
| lazy     | excluded                                  | included                       | key simply absent |
| deferred | excluded; key listed in `deferred[group]` | included                       | `deferred` member |
| always   | included                                  | included even if not named     | key present       |

After rendering a page with a non-empty `deferred`, the client SHOULD issue one partial request per group with `X-Bridge-Only: <keys of group>` and `X-Bridge-Component: <component>`, in parallel, and abort them if the user navigates away.

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
