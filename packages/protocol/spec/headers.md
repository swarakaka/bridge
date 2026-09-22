# Headers

Bridge prefers standard HTTP headers. Custom headers exist only where HTTP has no vocabulary for the intent. Every custom header is listed here; an implementation MUST NOT introduce another custom `X-Bridge-*` header without adding it to this document.

## 1. Request headers

### 1.1 Standard

| Header              | Use                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Accept`            | Mode selection. See [negotiation.md](negotiation.md).                                                                    |
| `Authorization`     | Bearer/API tokens. Interpreted by the application's guards, never by Bridge.                                             |
| `Cookie`            | Session authentication and CSRF cookie. Never read by Bridge.                                                            |
| `X-XSRF-TOKEN`      | Laravel's CSRF header, sent by browser clients on non-GET requests when a session cookie exists. Not Bridge-specific.    |
| `Last-Event-ID`     | Stream reconnection cursor (WHATWG Server-Sent Events). See [stream.md](stream.md).                                      |
| `If-None-Match`     | Conditional GET against a page/JSON `ETag`.                                                                              |
| `Purpose: prefetch` | Sent by clients on prefetch requests. Advisory; servers MAY use it to skip side effects such as analytics. Not required. |

### 1.2 Custom

| Header               | Modes      | Semantics                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Bridge-Build`     | page       | The client's asset build identifier. On a **GET** page request, if the server's current build differs, the server MUST respond `409 Conflict` with `X-Bridge-Location` (see [page.md](page.md) §5). Non-GET requests MUST NOT be rejected for build mismatch. Rationale: no standard header identifies a client bundle.                      |
| `X-Bridge-Only`      | page, json | Comma-separated list of prop keys to include. Keys MAY use dot notation for nested selection (`customers.data`). Whitespace around keys MUST be ignored. Props marked `always` are included regardless. See [page.md](page.md) §3.                                                                                                           |
| `X-Bridge-Except`    | page, json | Comma-separated list of prop keys to exclude. If both `X-Bridge-Only` and `X-Bridge-Except` are present, `X-Bridge-Only` wins and `X-Bridge-Except` MUST be ignored.                                                                                                                                                                         |
| `X-Bridge-Component` | page       | The component the client is currently displaying. When present on a request with `X-Bridge-Only`/`X-Bridge-Except`, the server MUST compare it with the page's component; on mismatch the server MUST ignore the partial-selection headers and return a full page. Rationale: a partial response must never be merged into a different page. |

Rejected alternatives: `Prefer` (RFC 7240) for partial selection (advisory semantics, stripped by some intermediaries) and query parameters (leak into history, logs, and cache keys).

## 2. Response headers

### 2.1 Standard

| Header                                   | Use                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Type`                           | `application/vnd.bridge+json; v=<n>`, `application/json`, `text/event-stream; charset=utf-8`, or `text/html; charset=utf-8`.    |
| `Vary`                                   | See [negotiation.md](negotiation.md) §5.                                                                                        |
| `Cache-Control`, `ETag`, `Last-Modified` | Caching. Defaults per mode are defined in `docs/PLAN.md` §24 and summarised in [page.md](page.md) §7 and [json.md](json.md) §5. |
| `Location`                               | Redirect target for `302`/`303`, and the created/target resource for JSON-mode mutation results.                                |
| `Retry-After`                            | With `429` and `503`.                                                                                                           |
| `X-Accel-Buffering: no`                  | Sent on streams to disable proxy buffering (Nginx convention; harmless elsewhere).                                              |

### 2.2 Custom

| Header              | Modes | Semantics                                                                                                                                                                                                              |
| ------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Bridge-Location` | page  | Present on `409 Conflict` responses. The absolute or path URL the client MUST navigate to with a full document load. Used for build mismatches and for redirects to another origin. The response body SHOULD be empty. |

## 3. Vary summary

| Mode   | Required `Vary` members                                            |
| ------ | ------------------------------------------------------------------ |
| html   | `Accept`                                                           |
| page   | `Accept`, `X-Bridge-Only`, `X-Bridge-Except`, `X-Bridge-Component` |
| json   | `Accept`, `X-Bridge-Only`, `X-Bridge-Except`, `X-Bridge-Component` |
| stream | none (never cacheable)                                             |

`X-Bridge-Build` is compared, not cached against, and MUST NOT appear in `Vary`.
