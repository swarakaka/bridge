# Content negotiation

Bridge selects the response **mode** from the request's `Accept` header and nothing else. No custom header participates in mode selection.

## 1. Modes and media types

| Mode     | Media type(s)                                 | Tie-break rank |
| -------- | --------------------------------------------- | -------------- |
| `stream` | `text/event-stream`                           | 1 (highest)    |
| `page`   | `application/vnd.bridge+json` (parameter `v`) | 2              |
| `json`   | `application/json`                            | 3              |
| `html`   | `text/html`, `application/xhtml+xml`          | 4 (lowest)     |

## 2. Algorithm

Given a request:

1. Parse the `Accept` header into media ranges with quality values (`q`) and parameters as defined in RFC 9110 §12.5.1. A missing or empty `Accept` header MUST be treated as `*/*`. A malformed range MUST be ignored; if nothing remains, treat as `*/*`.
2. For each mode, compute its **match quality**: the `q` of the most specific range that matches any of the mode's media types. Specificity order: exact `type/subtype` > `type/*` > `*/*`. A mode with no matching range, or whose best match has `q=0`, is **not acceptable**.
3. The selected mode is the acceptable mode with the highest match quality. Ties are broken by tie-break rank (lower rank number wins).
4. If no mode is acceptable, the server MUST respond `406 Not Acceptable` with an `application/json` body `{ "message": "Not Acceptable", "acceptable": [ ...media types... ] }`.

Consequences:

- `Accept: */*` (curl, many HTTP libraries) selects `html`. Servers MAY configure a different default mode for `*/*` per route or route group (Laravel: `bridge.negotiation.default_mode`, or a route default). This configuration only applies when every acceptable mode matched through `*/*` (a **wildcard-only** request). If the default mode is itself excluded (for example `text/html;q=0, */*`), the server falls back in the order `json`, `page`, `html`, `stream`, because wildcard-only requests come from generic HTTP clients for which JSON is the most useful representation.
- A browser navigation (`text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`) selects `html`.
- `Accept: application/json` selects `json`.
- `Accept: application/vnd.bridge+json; v=1` selects `page`.
- `Accept: application/vnd.bridge+json, application/json;q=0.9` selects `page`.
- `Accept: application/json, application/vnd.bridge+json` selects `page` (tie on q=1, page ranks higher).
- `Accept: text/event-stream` selects `stream`.

## 3. Protocol version parameter

When the selected mode is `page`, the server MUST read the `v` parameter of the matched `application/vnd.bridge+json` range.

- Absent `v` means `1`.
- If `v` is not a positive integer or exceeds the highest version the server supports, the server MUST respond `406 Not Acceptable` with an `application/json` body `{ "message": "Unsupported Bridge protocol version", "supported": [1] }`.
- Otherwise the response MUST carry `Content-Type: application/vnd.bridge+json; v=<version>` with the version actually used, which MUST be the requested version (servers do not silently downgrade).

Clients that receive `406` on a page request SHOULD perform a full document navigation to the requested URL.

## 4. Route intent

A route either **renders** (returns a page/JSON/HTML representation) or **streams** (returns `text/event-stream`). The negotiated mode and the route intent must agree:

- A rendering route with negotiated mode `stream` MUST respond `406` as in §2 step 4 with `acceptable` listing the rendering media types.
- A streaming route with any negotiated mode other than `stream` MUST respond `406` with `acceptable: ["text/event-stream"]`.

Rationale: silently falling back would hide proxy and client misconfiguration.

## 5. Response `Vary`

Every `page` and `json` response MUST include `Vary: Accept`. When the request may carry partial-selection headers (see [headers.md](headers.md)), the `Vary` header MUST also list `X-Bridge-Only`, `X-Bridge-Except`, and `X-Bridge-Component`. The recommended fixed value is:

```
Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component
```

`html` responses MUST include at least `Vary: Accept`.

## 5a. Page requests inside the server application (non-normative)

The page media type ends in `+json`, and some frameworks treat any `*/json` or `*+json` `Accept` as a request from an API client. Laravel's `wantsJson()`/`expectsJson()` do, and authentication packages then answer a login with JSON or `204` instead of a redirect. A server implementation SHOULD make application code see a page request as a browser navigation once the mode is negotiated, while its own representation logic uses the stored negotiation result. The Laravel server replaces `Accept` with `text/html, application/xhtml+xml` for the rest of the request and keeps the client's value in a request attribute. Nothing changes on the wire: the client still sends the page media type, and responses are selected as in §2.

## 6. What this specification does not do

- It does not use `X-Requested-With`.
- It does not use a marker header such as `X-Bridge: true`; the media type is the marker.
- It does not select a mode from the URL (no `.json` suffixes, no `?format=`). Servers MAY offer such conveniences outside the protocol but clients MUST NOT rely on them.
