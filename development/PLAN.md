# Bridge — Technical Implementation Plan

**Status:** v1 plan, 2026-09-22. Source of requirements: `development/propmts.md`.
**Audience:** the developer (or Claude Code session) that will run "Implement Phase 1".

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Architecture principles](#2-architecture-principles)
3. [Complete architecture diagram](#3-complete-architecture-diagram)
4. [Communication modes](#4-communication-modes)
5. [Content negotiation design](#5-content-negotiation-design)
6. [Bridge protocol (Page mode)](#6-bridge-protocol-page-mode)
7. [JSON protocol](#7-json-protocol)
8. [SSE protocol](#8-sse-protocol)
9. [Laravel package architecture](#9-laravel-package-architecture)
10. [Client packages: core and Vue architecture](#10-client-packages-core-and-vue-architecture)
11. [Router architecture](#11-router-architecture)
12. [Props architecture](#12-props-architecture)
13. [Lazy / deferred architecture](#13-lazy--deferred-architecture)
14. [Forms](#14-forms)
15. [Validation](#15-validation)
16. [File uploads](#16-file-uploads)
17. [Partial reload](#17-partial-reload)
18. [Prefetch](#18-prefetch)
19. [JSON / mobile architecture](#19-json--mobile-architecture)
20. [SSE architecture](#20-sse-architecture)
21. [Authentication](#21-authentication)
22. [Authorization](#22-authorization)
23. [Security](#23-security)
24. [Caching](#24-caching)
25. [Performance and benchmarks](#25-performance-and-benchmarks)
26. [SSR / SEO](#26-ssr--seo)
27. [Playground](#27-playground)
28. [Repository structure](#28-repository-structure)
29. [File-by-file implementation plan](#29-file-by-file-implementation-plan)
30. [Testing strategy](#30-testing-strategy)
31. [CI/CD](#31-cicd)
32. [Documentation](#32-documentation)
33. [Future React adapter](#33-future-react-adapter)
34. [Future mobile SDKs](#34-future-mobile-sdks)
35. [Risks](#35-risks)
36. [Alternatives considered](#36-alternatives-considered)
37. [Implementation phases](#37-implementation-phases)
38. [Definition of Done](#38-definition-of-done)
39. [Recommended V1 scope](#39-recommended-v1-scope)
40. [Recommended first milestone](#40-recommended-first-milestone)

- [Appendix A — Answers to the 20 architectural questions](#appendix-a--answers-to-the-20-architectural-questions)
- [Appendix B — Header and media-type reference](#appendix-b--header-and-media-type-reference)
- [Appendix C — Configuration reference](#appendix-c--configuration-reference)

---

## 1. Executive summary

Bridge is a **server-driven application protocol for Laravel** with a first-party Vue 3 client. One controller action returning `Bridge::render('Customers/Index', [...])` is served in three representations from the same route, guards, policies, and business logic:

| Mode                                      | Selected by                                | Body                                                                     |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| **Page** (SPA navigation)                 | `Accept: application/vnd.bridge+json; v=1` | Page object `{ type: "page", component, url, props, ... }`               |
| **JSON** (mobile, external, scripts)      | `Accept: application/json`                 | `{ data: props, meta? }` using Laravel-native resource shapes            |
| **Stream** (real-time)                    | `Accept: text/event-stream`                | `text/event-stream` with a `bridge` control event and application events |
| HTML shell (first load, no JS client yet) | `Accept: text/html` / `*/*`                | Minimal HTML with the initial page object embedded                       |

The decisive design choices, each justified later in the plan:

1. **Protocol before client.** `packages/protocol` is a language-neutral spec (Markdown + JSON Schema + fixtures). The Laravel package produces it, the TypeScript core consumes it, and both test suites validate against the same fixtures. Vue, React, and mobile are thin adapters over that core.
2. **Standard HTTP negotiation.** Mode is selected from `Accept` alone, with proper q-value parsing. Only four custom request headers exist (`X-Bridge-Build`, `X-Bridge-Only`, `X-Bridge-Except`, `X-Bridge-Component`) and one custom response header (`X-Bridge-Location`). The `X-Bridge: true` marker from the brief is **not** needed and is dropped.
3. **Three-layer model.** Controller → `Page` value object (domain representation: component + prop bag) → `Representer` per mode (transport). Errors follow the same path through one `ErrorEnvelope`.
4. **No Bridge resource layer.** Props resolve `JsonResource`, `ResourceCollection`, paginators, `Arrayable`, `JsonSerializable`, closures, and Bridge's `lazy`/`defer`/`always` wrappers. JSON mode reuses Laravel's native shapes so it feels like a normal Laravel API.
5. **Validation errors are returned as 422 in Page and JSON mode, never as redirect-back-with-flash.** This removes the session dependency, gives stateless clients the same behaviour as browsers, and makes one `ErrorEnvelope` serve all modes. Plain HTML (no Bridge client) keeps Laravel's default redirect behaviour.
6. **SSE is core, invalidate-first.** The default real-time pattern is `invalidate(keys)` → client partial reload through the normal authorized request path. Direct `prop` pushes exist for small, non-sensitive values. The event bus is an interface with `sync`, `redis` (Redis Streams, with replay) and `database` drivers. Redis is not required.
7. **Honest PHP-FPM story.** Each SSE connection occupies one worker. Bridge bounds connection lifetime (`max_duration`), heartbeats, uses blocking reads with timeouts, and the client reconnects transparently with `Last-Event-ID`. Octane/FrankenPHP raises the ceiling; a future external relay is possible because publishing is decoupled from serving.
8. **Fetch-based SSE client by default**, because native `EventSource` cannot send `Authorization` headers. Native `EventSource` remains an option for cookie-authenticated apps.
9. **Embedded initial props by default** (hybrid mode), with a static-shell + bootstrap-request mode available. HTTP caching cannot remove the second request's latency for private data, so embedding wins.

Recommended first milestone: a curl-verifiable Laravel package that serves HTML, Page, and JSON from one controller with negotiation, props, errors, and redirects fully tested (Phase 1). Vue client is Phase 2, SSE is Phase 3.

---

## 2. Architecture principles

1. **Layering is `Laravel → Bridge Protocol → Client`.** No class in `packages/laravel` may reference Vue, Vite, or a component file format. "Component" is an opaque string.
2. **Negotiate once, centrally.** `ContentNegotiator` runs in the `HandleBridgeRequests` middleware and stores a `Mode` on the request. Nothing else inspects `Accept`.
3. **Representation ≠ transport.** A `Page` (component, prop bag, url, meta) and an `ErrorEnvelope` are the representation. `Representer` implementations (HTML, Page, JSON) and `StreamResponse` are the transport.
4. **Laravel owns authentication and authorization.** Bridge never reads tokens, never decides who the user is, and never bypasses a guard. It only decides the shape of the response.
5. **Prefer Laravel-native abstractions.** `JsonResource`, paginators, `Responsable`, `Gate`, `throttle`, the exception handler's `render` hook, `URL::temporarySignedRoute`, `Cache`, `Redis` facade.
6. **Standard HTTP first.** Custom headers only where HTTP has no vocabulary, and every one is documented in Appendix B.
7. **Conservative caching.** Everything authenticated is `private`. `public` caching is opt-in per response and guarded.
8. **Stateless where possible.** Page and JSON mode must work with a bearer token and no session. Session is used only for what browsers need (CSRF, flash for no-JS fallbacks).
9. **Protocol is versioned and additive.** Version `1` is negotiated through the media type parameter `v`. Additive fields never bump the version.
10. **No unbenchmarked claims.** Every performance statement in docs links to a reproducible benchmark in `benchmarks/`.

---

## 3. Complete architecture diagram

```
                                 ┌────────────────────────────────────────────────┐
                                 │                 Laravel app                     │
                                 │  routes/web.php   Controllers   Policies  Auth  │
                                 └───────────────┬────────────────────────────────┘
                                                 │ Bridge::render() / Bridge::redirect() / Bridge::stream()
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 packages/laravel  (Bridge\)                                    │
│                                                                                                │
│  HandleBridgeRequests middleware                                                               │
│    └─ ContentNegotiator ──► Mode { Html | Page | Json | Stream }  (from Accept)                 │
│                                                                                                │
│  Representation layer                          Transport layer                                 │
│  ┌──────────────────────────┐                  ┌─────────────────────────────────────────────┐ │
│  │ Page (component, props,  │   Representer    │ HtmlRepresenter   → text/html shell         │ │
│  │   url, meta, deferred)   │ ───────────────► │ PageRepresenter   → application/vnd.bridge  │ │
│  │ Redirect (to, data)      │                  │ JsonRepresenter   → application/json        │ │
│  │ ErrorEnvelope            │                  │ StreamResponse    → text/event-stream       │ │
│  └──────────────────────────┘                  └─────────────────────────────────────────────┘ │
│           ▲                                                      ▲                             │
│  PropResolver (shared, only/except, lazy, defer,                 │  EventBus (contract)          │
│    JsonResource, paginator, closures)                            │   ├─ SyncBus                  │
│                                                                  │   ├─ RedisStreamsBus          │
│  ExceptionRenderer (Validation, Auth, 404, 419, 429, 5xx)        │   └─ DatabaseBus              │
│                                                                  │  Publisher / ChannelAuthorizer│
└──────────────────────────────────────────────────────────────────┴─────────────────────────────┘
                 │                          │                          │
     text/html + embedded page      application/vnd.bridge+json    application/json     text/event-stream
                 │                          │                          │                        │
                 ▼                          ▼                          ▼                        ▼
┌──────────────────────────────────────────────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ packages/core (@swarakaka/bridge-core, TypeScript)        │  │ Mobile / CLI │  │ packages/core stream │
│  Http client · Router · PageStore · Forms · StreamClient  │  │ any HTTP lib │  │ fetch or EventSource │
└───────────────┬──────────────────────────────┬───────────┘  └──────────────┘  └──────────────────────┘
                │                              │
   packages/vue (@swarakaka/bridge-vue)   future @swarakaka/bridge-react
   createBridgeApp · usePage · useForm ·  (same core, different bindings)
   useStream · BridgeLink
```

Shape of the protocol package that sits between the two halves:

```
packages/protocol/
  spec/            page.md  json.md  stream.md  negotiation.md  errors.md  headers.md
  schemas/         page.schema.json  error.schema.json  stream-event.schema.json  redirect.schema.json
  fixtures/        page/*.json  error/*.json  stream/*.txt   ← validated by Pest AND Vitest
  src/             TypeScript types generated from schemas (json-schema-to-typescript)
```

---

## 4. Communication modes

### 4.1 HTML shell (mode `html`)

Triggered by a browser navigation (`Accept: text/html,...`) or any request without a more specific acceptable type. Response is the app shell Blade view (`resources/views/app.blade.php`) with:

- `<div id="app" data-bridge></div>`
- `<script type="application/json" id="bridge-page">{ page object }</script>` when `bridge.shell.embed` is true (default)
- `<meta name="bridge-build" content="...">` and `<meta name="bridge-protocol" content="1">`
- Vite tags provided by the app

If `bridge.shell.embed` is false, the shell contains no page object and the client makes a bootstrap Page request for the current URL on mount. This supports serving the shell statically (CDN, Capacitor, PWA).

### 4.2 Page mode (mode `page`)

Bridge client navigation. Request:

```http
GET /customers?page=2
Accept: application/vnd.bridge+json; v=1
X-Bridge-Build: 3f9c1a
```

Response `200`:

```http
Content-Type: application/vnd.bridge+json; v=1
Cache-Control: private, no-cache
Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component
ETag: W/"..."
```

Body: the Page object (section 6).

### 4.3 JSON mode (mode `json`)

Request `Accept: application/json`. Response `application/json` with `{ data, meta? }` (section 7). Laravel-native error shapes.

### 4.4 Stream mode (mode `stream`)

Request `Accept: text/event-stream` to a route whose action returns `Bridge::stream()`. Response `text/event-stream` (section 8). A `Bridge::render()` route asked for `text/event-stream` answers `406` with a JSON problem body listing acceptable types. A stream route asked for anything but `text/event-stream` answers `406` likewise. This keeps mode selection purely `Accept`-driven while keeping route intent explicit.

### 4.5 Redirects across modes

`Bridge::redirect()` (section 9.4) is represented as:

| Mode   | Status                                             | Body / headers                                                                                |
| ------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| html   | 302                                                | `Location`                                                                                    |
| page   | 303                                                | `Location` (client follows with Page `Accept`) ; external hosts → `409` + `X-Bridge-Location` |
| json   | configurable, default 200 (201 with `->created()`) | `Location` + `{ data, meta: { location } }`                                                   |
| stream | n/a                                                | emits `navigate` event                                                                        |

---

## 5. Content negotiation design

### 5.1 Algorithm

Implemented in `Bridge\Negotiation\ContentNegotiator::negotiate(Request): Negotiation`.

1. Parse `Accept` into media ranges with q-values and parameters (RFC 9110 §12.5.1). Missing header ⇒ `*/*`.
2. Candidate modes and their media types, in **tie-break order**:
   1. `stream` — `text/event-stream`
   2. `page` — `application/vnd.bridge+json` (params: `v`)
   3. `json` — `application/json`
   4. `html` — `text/html`, `application/xhtml+xml`
3. For each candidate compute the best matching q-value from the ranges (exact type > `type/*` > `*/*`, as RFC specificity dictates). Candidates with q=0 are excluded.
4. Pick the highest q. On ties, use the order above (more specific/purposeful first). `*/*` alone therefore yields **html**.
5. If the winner is `page`, read `v`. If absent, assume `1`. If higher than the server's maximum, respond `406` with body `{"message":"Unsupported Bridge protocol version","supported":[1]}` and `Content-Type: application/json`. The client treats 406 on a Page request as "reload the full document".
6. Store `Negotiation { mode, protocolVersion, acceptedType }` as a request attribute (`$request->attributes->get('bridge')`), plus a `Request` macro `$request->bridgeMode()`.

Per-route default override for wildcard requests: `Route::get(...)->defaults('bridge.default_mode', 'json')` lets an API-only route group answer `*/*` with JSON (useful for scripts that send no `Accept`). Documented; not used by the playground's page routes.

### 5.2 Why `Accept` only and no `X-Bridge` header

- `application/vnd.bridge+json` is unambiguous; a marker header adds nothing.
- Browser `fetch` keeps request headers, including `Accept`, when following a 303, so redirect chains stay in Page mode without a marker.
- `Vary: Accept` is the standard cache-correctness mechanism for this case. The residual risk (CDNs that ignore `Vary`) is addressed by making Page and JSON responses `private` by default (section 24) and documenting CDN cache keys for public pages.
- Fewer headers means fewer `Vary` dimensions and less to document for mobile SDKs.

### 5.3 Why 406 rather than fallback for stream routes

A stream route that silently returned HTML would hide misconfiguration (missing `Accept` from a proxy). A 406 with a JSON body is immediately diagnosable and appears in the `bridge:doctor` command's checks.

### 5.4 Interaction with Laravel's own `expectsJson()`

Laravel's exception handler and `Authenticate` middleware use `expectsJson()` (true for `application/json` and for `X-Requested-With: XMLHttpRequest`). Bridge's `ExceptionRenderer` runs before Laravel's default renderer and takes over for any request whose mode is `page`, `json` or `stream`, so Laravel's own heuristics never decide the shape of a Bridge response. `Authenticate::redirectTo()` is bypassed for Page/JSON by Bridge's renderer returning 401 with a `redirect` hint instead.

---

## 6. Bridge protocol (Page mode)

### 6.1 Page object

```jsonc
{
  "protocol": 1,                      // integer; repeated in body so embedded shells are self-describing
  "type": "page",
  "component": "Customers/Index",     // opaque string resolved by the client
  "url": "/customers?page=2",         // path + query as the server sees it; client pushes this to history
  "props": { ... },                   // resolved prop bag; always includes shared props
  "build": "3f9c1a",                  // asset build id or null
  "deferred": { "default": ["stats"], "charts": ["revenue"] },  // groups → keys to load after mount
  "meta": {}                          // reserved for additive extensions (title, breadcrumbs...)
}
```

Rules:

- `props` is always an object. Key order is not significant.
- Partial responses (`X-Bridge-Only`/`X-Bridge-Except`) contain only the requested keys plus `always` props. `component` and `url` are still present so the client can verify the merge target.
- `deferred` lists keys **absent** from `props`; the client requests them via partial reload immediately after render, one request per group.
- Unknown top-level fields must be ignored by clients (forward compatibility).

### 6.2 Error object

Returned with a 4xx/5xx status and `Content-Type: application/vnd.bridge+json; v=1`:

```jsonc
{
  "protocol": 1,
  "type": "error",
  "error": {
    "status": 422,
    "kind": "validation", // validation | unauthenticated | forbidden | not_found | csrf | throttled | conflict | server
    "message": "The given data was invalid.",
    "errors": { "email": ["The email field is required."] }, // validation only
    "redirect": "/login", // optional hint; unauthenticated uses it
    "retryAfter": 30, // throttled only
  },
}
```

The client emits `error` on every non-2xx Page response. `validation` is routed to the form that made the request. `unauthenticated` triggers navigation to `redirect` when present. Other kinds render the app's error component if `resolveError` is configured, else a full-document reload.

### 6.3 Build (asset version) conflicts

Client sends `X-Bridge-Build` on every Page request. If the server's `Bridge::version()` differs on a **GET**, respond `409 Conflict` with `X-Bridge-Location: <requested url>` and no body. The client performs `window.location = X-Bridge-Location`. Non-GET requests are never rejected for build mismatch (a form submission must not be lost); instead the client will hit the conflict on the next GET.

### 6.4 External redirects

When a Page request receives a redirect to another origin, `PageRepresenter` converts it into `409` + `X-Bridge-Location`. Same-origin redirects are ordinary 303s.

### 6.5 Shared props and flash

`Bridge::share('auth', fn () => ...)` adds to every page. Bridge ships two default shared props, both overridable:

- `errors`: session validation errors (only present after a **non-Bridge** HTML form post redirected back; Page and JSON mode receive 422 directly).
- `flash`: `{ message?: string, level?: string }` read from session keys configured in `bridge.flash.keys`.

---

## 7. JSON protocol

### 7.1 Envelope

```jsonc
// Bridge::render('Customers/Index', ['customers' => CustomerResource::collection(Customer::paginate())])
{
  "data": {
    "customers": {
      "data": [ ... ],
      "links": { "first": "...", "last": "...", "prev": null, "next": "..." },
      "meta": { "current_page": 1, "per_page": 20, "total": 57, ... }
    }
  },
  "meta": {}      // optional; present only when non-empty (e.g. location on redirects, flash)
}
```

- `data` is the resolved prop bag. Each prop keeps its Laravel-native serialization: `JsonResource::resolve()`, `ResourceCollection` with a paginator produces `{data, links, meta}` exactly as Laravel's `PaginatedResourceResponse` does, plain paginators produce Laravel's paginator array, `Arrayable`/`JsonSerializable` as usual.
- `lazy` props are excluded unless requested with `X-Bridge-Only`. `defer` props are **resolved inline** in JSON mode (`bridge.json.resolve_deferred = true`) because JSON clients have no post-render phase.
- Optional root selection: `Bridge::render(...)->jsonRoot('customer')` makes `data` the single prop and moves the other props under `meta`. This is sugar for single-resource endpoints, added in Phase 4.

### 7.2 Errors

Laravel-native shapes, so that Laravel documentation applies unchanged:

| Kind            | Status | Body                                                                       |
| --------------- | ------ | -------------------------------------------------------------------------- |
| validation      | 422    | `{ "message": "...", "errors": { field: [msg] } }`                         |
| unauthenticated | 401    | `{ "message": "Unauthenticated." }`                                        |
| forbidden       | 403    | `{ "message": "This action is unauthorized." }`                            |
| not_found       | 404    | `{ "message": "Not Found." }` (or model message in debug)                  |
| throttled       | 429    | `{ "message": "Too Many Attempts." }` + `Retry-After`                      |
| server          | 500    | `{ "message": "Server Error." }` (+ `exception`, `trace` when `app.debug`) |

The same `ErrorEnvelope` value object produces both this and the Page error object.

### 7.3 Redirect and mutation results

`return Bridge::redirect()->route('customers.show', $customer)->with('customer', CustomerResource::make($customer))->created();`

JSON mode → `201 Created`, `Location: /customers/12`, body `{ "data": { "customer": {...} }, "meta": { "location": "/customers/12" } }`. Without `->with()` the body is `{ "data": null, "meta": { "location": ... } }`.

### 7.4 What JSON mode is not

It is not JSON:API, does not add hypermedia, and does not version itself. The app's API versioning (route prefixes, resource classes) applies as in any Laravel app. See section 36 for the JSON:API rejection.

---

## 8. SSE protocol

### 8.1 Wire format

Standard `text/event-stream` (WHATWG). Bridge reserves the event name `bridge` for control messages. Any other `event:` name is an application event whose `data` is application JSON.

```
retry: 3000
event: bridge
data: {"type":"ready","protocol":1,"replayed":false,"heartbeat":15000,"maxDuration":60000}

: hb

id: 1758542400123-0
event: bridge
data: {"type":"invalidate","keys":["customers"]}

id: 1758542400987-0
event: bridge
data: {"type":"prop","key":"unreadCount","value":3,"mode":"replace"}

event: bridge
data: {"type":"notification","level":"success","title":null,"message":"Customer saved"}

event: bridge
data: {"type":"navigate","url":"/customers/12","replace":false}

event: bridge
data: {"type":"progress","id":"export-9","value":0.6,"label":"Exporting"}

event: bridge
data: {"type":"error","status":403,"kind":"forbidden","message":"...","final":true}

event: bridge
data: {"type":"end","reason":"max_duration","reconnect":true}

id: 1758542401555-0
event: customer.created
data: {"id":12,"name":"Acme"}
```

### 8.2 Control event types (final list)

| Type           | Purpose                                                                                                          | Client default behaviour                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ready`        | First event. Declares protocol, whether `Last-Event-ID` replay happened, heartbeat interval, max duration.       | If `replayed` is false and this is a reconnect, client runs a **resync** (partial reload of all keys it watches).         |
| `invalidate`   | `keys: string[] \| "*"` — page props that are stale.                                                             | Coalesced (50 ms) partial reload with `only: keys`; `"*"` reloads all. Ignored if current component has none of the keys. |
| `prop`         | Set a prop directly. `mode`: `replace` (default), `merge` (object merge), `append`/`prepend` (arrays).           | Applied to page store if key exists on the current page.                                                                  |
| `notification` | User-facing message.                                                                                             | Emitted as `notification`; the app renders toasts.                                                                        |
| `navigate`     | Server-initiated navigation. Same-origin only unless client opts in.                                             | `router.visit(url)`.                                                                                                      |
| `progress`     | Long-running operation progress.                                                                                 | Emitted as `progress`.                                                                                                    |
| `error`        | Stream-level error. `final: true` means the server closes and the client must not auto-reconnect (e.g. 401/403). | Emitted; reconnect suppressed when `final`.                                                                               |
| `end`          | Orderly close. `reconnect` tells the client whether to reconnect immediately.                                    | Reconnect (no backoff) when `reconnect: true`.                                                                            |

Dropped from the brief's candidate list: `patch` (= `prop` with `mode: merge`), `refresh` (= `invalidate: "*"`), `heartbeat` as an event (it is a comment line `: hb`, which never wakes the JS event loop in native `EventSource`; the fetch client surfaces it as a local `heartbeat` signal for the UI and liveness timer).

### 8.3 IDs, replay and ordering

- `id:` is the bus cursor (`<ms>-<seq>` for Redis Streams, auto-increment for database, monotonic counter for sync). Control events that originate from the bus carry ids; locally generated ones (`ready`, `end`, heartbeat) do not.
- On reconnect the client sends `Last-Event-ID` (native `EventSource` does this automatically; the fetch client sets the header). The server asks the bus for events since that id when `supportsReplay()`. Replayed events are re-authorized against the channels the user is allowed **now**, so a revoked user cannot replay.
- Ordering is guaranteed per channel; across channels the bus's merged order is used.

### 8.4 Server-side API

```php
// Long-lived subscription (routes/web.php)
Route::get('/events', fn () => Bridge::stream()->channels(fn ($user) => [
    'customers',
    "user.{$user->id}",
    "tenant.{$user->tenant_id}",
]))->middleware('auth');

// One-off producer (e.g. progress of a request-scoped job)
Route::post('/exports', fn () => Bridge::stream(function (StreamWriter $s) {
    foreach ($chunks as $i => $chunk) {
        $s->progress('export', $i / count($chunks));
    }
    $s->end();
}));

// Publishing from anywhere (controller, listener, job)
Bridge::to('customers')->invalidate('customers');
Bridge::to("user.{$id}")->notify('Customer saved', level: 'success');
Bridge::to(['tenant.7', 'customers'])->event('customer.created', CustomerResource::make($c));
Bridge::to("user.{$id}")->prop('unreadCount', 3);
Bridge::to("user.{$id}")->navigate('/customers/12');

// Event-class integration (mirrors ShouldBroadcast)
class CustomerCreated implements ShouldStream {
    public function streamOn(): array { return ['customers', "tenant.{$this->customer->tenant_id}"]; }
    public function toStream(): StreamMessage { return StreamMessage::invalidate(['customers']); }
}
```

Channel authorization mirrors `Broadcast::channel`:

```php
Bridge::channel('tenant.{tenantId}', fn (User $user, int $tenantId) => $user->tenant_id === $tenantId);
```

`channels()` on a stream may be a static array (trusted, computed server-side) or the client may request extra channels via `?channels=a,b` which are then validated through the authorizer. Unauthorized channel requests end the stream with `error{kind: forbidden, final: true}`.

### 8.5 Client API (core + Vue)

```ts
const stream = bridge.stream('/events', {
  transport: 'fetch',                 // 'fetch' (default) | 'eventsource'
  headers: () => ({ Authorization: `Bearer ${token}` }),   // fetch only
  withCredentials: true,
  channels: ['customers'],            // optional, validated server-side
  backoff: { initial: 1000, max: 30000, factor: 2, jitter: 0.3 },
  heartbeatTimeout: 2.5,              // × server heartbeat interval before forcing reconnect
  autoConnect: true,
  handleControl: true,                // apply invalidate/prop/navigate to the page store
})
stream.state                          // 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'
stream.on('customer.created', e => ...)
stream.on('notification', n => ...)
stream.on('state', s => ...)
stream.on('heartbeat', () => ...)
stream.close()
```

Vue: `const { state, on, close, lastEventAt, reconnectAttempts } = useStream('/events', options)`; closes on unmount.

---

## 9. Laravel package architecture

Composer package `swarakaka/bridge-laravel`, namespace `Bridge\`. PHP 8.2+, Laravel 11/12 (13 when stable).

### 9.1 Public facade surface

```php
Bridge::render(string $component, array $props = []): PageResponse
Bridge::redirect(): RedirectBuilder        // ->to() ->route() ->back() ->with() ->flash() ->status() ->created()
Bridge::stream(?callable $producer = null): StreamResponse
Bridge::to(string|array $channels): Publisher
Bridge::channel(string $pattern, callable $authorizer): void
Bridge::share(string|array $key, mixed $value = null): void
Bridge::version(string|Closure|null $version): void      // asset build
Bridge::lazy(Closure $fn): Lazy
Bridge::defer(Closure $fn, string $group = 'default'): Deferred
Bridge::always(mixed $value): Always
Bridge::shell(string $view): void                        // Blade view name for the HTML shell
Bridge::mode(): Mode                                     // current negotiated mode (for the rare app-level need)
```

### 9.2 Class map and responsibilities

| Class                                                                       | Responsibility                                                                                                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bridge\BridgeServiceProvider`                                              | Bind services, publish config/views/migration, register middleware alias, exception renderer, Blade directive `@bridge`, testing macros, console commands.        |
| `Bridge\Bridge` (manager)                                                   | Facade root. Holds shared props, version resolver, shell view, channel authorizer registry; builds responses.                                                     |
| `Bridge\Negotiation\ContentNegotiator`                                      | The algorithm in §5.                                                                                                                                              |
| `Bridge\Negotiation\AcceptHeader`, `MediaRange`                             | RFC 9110 parsing with q and parameters.                                                                                                                           |
| `Bridge\Negotiation\Mode` (enum)                                            | `Html`, `Page`, `Json`, `Stream`.                                                                                                                                 |
| `Bridge\Negotiation\Negotiation`                                            | Value object stored on the request.                                                                                                                               |
| `Bridge\Http\Middleware\HandleBridgeRequests`                               | Negotiate, build-version check (409), attach `Vary`, wrap response. Registered in `web` group by `bridge:install`.                                                |
| `Bridge\Http\Middleware\VerifyCsrfToken`                                    | Extends Laravel's; skips CSRF when the request carries `Authorization: Bearer` **and** no session cookie (§21.3). Opt-in replacement.                             |
| `Bridge\Page\Page`                                                          | Immutable representation: component, url, props (unresolved), meta, deferred groups.                                                                              |
| `Bridge\Page\PropBag`                                                       | Ordered map with `only`/`except`/`always` semantics.                                                                                                              |
| `Bridge\Props\{Lazy, Deferred, Always, Merge}`                              | Marker wrappers. `Merge` (Phase 4) marks arrays the client should concatenate.                                                                                    |
| `Bridge\Props\PropResolver`                                                 | Applies partial selection and resolves wrappers/closures for a given `Mode` + `Request`.                                                                          |
| `Bridge\Props\Serializer`                                                   | Turns resolved values into JSON-ready arrays (JsonResource, ResourceCollection+paginator, paginators, Arrayable, JsonSerializable, Enums, DateTime, Collections). |
| `Bridge\Http\Responses\PageResponse`                                        | `Responsable` returned by `Bridge::render()`. Picks a `Representer` by mode. Fluent: `->jsonRoot()`, `->cache()`, `->withMeta()`.                                 |
| `Bridge\Http\Responses\RedirectBuilder`                                     | `Responsable` returned by `Bridge::redirect()`.                                                                                                                   |
| `Bridge\Representation\Representer` (interface)                             | `represent(Page, Request): Response`, `representRedirect(...)`, `representError(ErrorEnvelope, Request): Response`.                                               |
| `Bridge\Representation\{HtmlRepresenter, PageRepresenter, JsonRepresenter}` | Transport implementations.                                                                                                                                        |
| `Bridge\Representation\RepresenterRegistry`                                 | Mode → Representer; apps may swap implementations.                                                                                                                |
| `Bridge\Errors\ErrorEnvelope`                                               | status, kind, message, errors, redirect, retryAfter. Built by `ErrorMapper`.                                                                                      |
| `Bridge\Errors\ErrorMapper`                                                 | Exception → ErrorEnvelope (Validation, Authentication, Authorization, ModelNotFound/NotFoundHttp, TokenMismatch, ThrottleRequests, HttpException, Throwable).     |
| `Bridge\Errors\ExceptionRenderer`                                           | Registered with the app's exception handler; renders for Page/JSON/Stream modes.                                                                                  |
| `Bridge\Stream\StreamResponse`                                              | `Responsable` → `StreamedResponse`. Runs the loop in §20.3.                                                                                                       |
| `Bridge\Stream\StreamWriter`                                                | Low-level writer: `event()`, `control()`, `comment()`, `retry()`, `flush()`; wraps output buffering and abort detection.                                          |
| `Bridge\Stream\StreamMessage`                                               | Value object for control messages (static constructors).                                                                                                          |
| `Bridge\Stream\Publisher`                                                   | Fluent publish API returned by `Bridge::to()`.                                                                                                                    |
| `Bridge\Stream\ChannelAuthorizer`                                           | Pattern registry and matching (same pattern syntax as broadcasting channels).                                                                                     |
| `Bridge\Stream\Contracts\{EventBus, ShouldStream}`                          | Bus contract; event-class marker.                                                                                                                                 |
| `Bridge\Stream\Bus\{Envelope, Cursor}`                                      | Bus message (`id`, `channel`, `event`, `data`, `publishedAt`).                                                                                                    |
| `Bridge\Stream\Bus\{SyncBus, RedisStreamsBus, DatabaseBus, NullBus}`        | Drivers.                                                                                                                                                          |
| `Bridge\Stream\Bus\BusManager`                                              | Laravel `Manager` subclass; `bridge.stream.driver`.                                                                                                               |
| `Bridge\Stream\Listeners\PublishStreamableEvents`                           | Listens to `ShouldStream` events and publishes.                                                                                                                   |
| `Bridge\Stream\ConnectionLimiter`                                           | Per-user concurrent stream cap using Cache with TTL.                                                                                                              |
| `Bridge\Ssr\{SsrGateway, HttpSsrGateway, NullSsrGateway}`                   | Phase 5.                                                                                                                                                          |
| `Bridge\Testing\{BridgeTestingMacros, AssertablePage, AssertableStream}`    | Pest/PHPUnit helpers.                                                                                                                                             |
| `Bridge\Console\{InstallCommand, DoctorCommand, PruneStreamEventsCommand}`  | Install scaffolding; runtime diagnostics (output buffering, FPM settings, proxy buffering header, bus connectivity); database bus pruning.                        |
| `Bridge\Support\Version`                                                    | Resolves the build id (manifest hash by default).                                                                                                                 |

### 9.3 Request lifecycle (Page/JSON)

```
Route → HandleBridgeRequests (negotiate, 409 check)
      → auth / throttle / other middleware (unchanged)
      → Controller → Bridge::render() → PageResponse (Responsable)
      → PageResponse::toResponse(): PropResolver → Serializer → Representer[mode] → Response
      → HandleBridgeRequests adds Vary, cache headers, ETag (GET only)
Exceptions anywhere → ExceptionRenderer → ErrorMapper → Representer[mode]->representError
```

### 9.4 Redirect builder

```php
Bridge::redirect()->route('customers.show', $c)->flash('Saved')->with('customer', CustomerResource::make($c))->created();
```

`flash()` writes to session when a session exists (browser); in JSON mode it is echoed under `meta.flash` so stateless clients still get it.

---

## 10. Client packages: core and Vue architecture

### 10.1 Why a framework-agnostic core

`@swarakaka/bridge-core` contains everything that is not view-layer binding: HTTP, negotiation headers, router, history, page store, forms state machine, stream client, cache, event emitter. `@swarakaka/bridge-vue` adds reactivity bindings and components. `@swarakaka/bridge-react` (future) does the same with hooks. This is what makes §33 possible without server changes.

### 10.2 Core modules

| Module                  | Responsibility                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBridge(options)` | Builds a `Bridge` instance: `{ http, router, pages, forms, stream, events, cache, config }`.                                                                                                                                            |
| `http/RequestManager`   | `fetch` wrapper: sets `Accept: application/vnd.bridge+json; v=1`, `X-Bridge-Build`, partial headers, `X-XSRF-TOKEN` from cookie, `credentials: 'same-origin'`; dedupes and aborts in-flight visits; XHR path for uploads with progress. |
| `http/responseParser`   | Classifies responses: page / error / redirect(409) / 406 / non-Bridge (HTML) and validates `Content-Type`.                                                                                                                              |
| `router/Router`         | `visit`, `get/post/put/patch/delete`, `reload`, `prefetch`, `back`; visit lifecycle events; `preserveState`, `preserveScroll`, `replace`, `only/except`.                                                                                |
| `router/History`        | `pushState`/`replaceState` with serialized page + scroll positions + `remember` state; `popstate` restore.                                                                                                                              |
| `router/Scroll`         | Scroll region tracking and restoration.                                                                                                                                                                                                 |
| `pages/PageStore`       | Current `Page`, `setPage`, `patchProps`, `applyControl(event)` (invalidate/prop/navigate), subscription API.                                                                                                                            |
| `forms/createForm`      | Data, dirty tracking, `errors`, `processing`, `progress`, `submit(method, url, options)`, `transform`, `reset`, `setError`, `clearErrors`, `remember`.                                                                                  |
| `stream/StreamClient`   | Fetch and EventSource transports, SSE parser (for fetch), backoff, `Last-Event-ID`, heartbeat watchdog, visibility/online triggers, control dispatch to `PageStore`.                                                                    |
| `stream/sseParser`      | Incremental parser for `text/event-stream` bytes (fields `event`, `data`, `id`, `retry`, comments).                                                                                                                                     |
| `cache/PageCache`       | In-memory LRU with TTL and stale-while-revalidate, keyed by URL + partial headers; used by prefetch and back-nav.                                                                                                                       |
| `events/Emitter`        | Typed emitter: `before`, `start`, `progress`, `success`, `error`, `invalid`, `exception`, `finish`, `navigate`, `notification`, `stream:*`.                                                                                             |
| `types`                 | Re-exports from `@swarakaka/bridge-protocol`.                                                                                                                                                                                           |

### 10.3 Vue package

| Export                                                           | Responsibility                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBridgeApp({ resolve, setup, page?, progress?, stream? })` | Reads `#bridge-page` (or bootstraps when absent), resolves the component, mounts, provides the `Bridge` instance.                                                         |
| `usePage<T>()`                                                   | Reactive page (`component`, `props`, `url`).                                                                                                                              |
| `useProp<T>(key)`                                                | Reactive ref to one prop, updated by navigation, partial reload, and stream `prop`/`invalidate`.                                                                          |
| `useForm(initial)`                                               | Reactive wrapper around `createForm`.                                                                                                                                     |
| `useStream(url, options)`                                        | Reactive `state`, `on`, `close`; unmount cleanup.                                                                                                                         |
| `useRemember(key, value)`                                        | Persist local state into history.                                                                                                                                         |
| `useDeferred(key)`                                               | `{ loading, value }` for deferred props.                                                                                                                                  |
| `<BridgeLink>`                                                   | Anchor that calls `router.visit`; props `href`, `method`, `data`, `replace`, `preserveState`, `preserveScroll`, `only`, `prefetch` (`hover` \| `mount` \| `false`), `as`. |
| `<BridgeHead>`                                                   | Minimal head management (title/meta) with SSR support (Phase 5).                                                                                                          |
| `<Deferred>`                                                     | Renders fallback until a deferred prop group has loaded.                                                                                                                  |
| `router`                                                         | The core router instance for use outside components.                                                                                                                      |

---

## 11. Router architecture

- **Visit lifecycle:** `before` (cancellable) → `start` → `progress` (uploads) → one of `success` / `invalid` (422) / `error` (other Bridge errors) / `exception` (network, non-Bridge response) → `finish`. `navigate` fires after a successful page swap.
- **Concurrency:** a new visit aborts the in-flight one (AbortController). `reload` calls with the same `only` set are coalesced within 50 ms (needed for SSE invalidations).
- **Redirect handling:** `fetch` follows 303 with GET automatically; the parser reads `response.url` to set the final page URL. 409 + `X-Bridge-Location` → hard navigation. 406 → hard navigation (unsupported version).
- **Non-Bridge responses** (e.g. `text/html` login page after session expiry when a proxy stripped headers) raise `exception` with the response; default handler shows a modal with the HTML in debug, hard-reloads in production.
- **History:** every page swap stores `{ page, scroll, remember }` in `history.state`. `popstate` restores from state without a request (configurable `restoreFromHistory: true`); if the page is missing from state, it re-requests.
- **Scroll:** `preserveScroll` for the window and for `[bridge-scroll-region]` elements.
- **Prefetch and cache:** §18.
- **Method spoofing:** PUT/PATCH/DELETE with files → `POST` + `_method` field (Laravel convention).
- **URL handling:** relative URLs resolved against `location`; absolute same-origin URLs allowed; cross-origin visits fall back to `location.href`.

---

## 12. Props architecture

Resolution pipeline (server, `PropResolver::resolve(Page, Mode, Request)`):

1. Merge shared props (`Bridge::share`) under page props; page props win on key conflict.
2. Read `X-Bridge-Only` / `X-Bridge-Except`; if `X-Bridge-Component` is present and does not equal the page's component, ignore partial headers and return a full page (prevents applying stale partials after a redirect).
3. Apply selection. `Always` props survive `only`. Nested selection supports dot keys (`customers.data`).
4. Drop `Lazy` unless explicitly in `only`. In `page` mode, drop `Deferred` on full loads and record groups in `deferred`; in `json` mode resolve them inline.
5. Resolve closures (container-injected), then `Serializer` recursively.
6. Merge props (`Merge`, Phase 4) are listed in `meta.merge` so the client concatenates instead of replacing.

Client-side, props are plain JSON. `PageStore.patchProps` supports replace/merge/append semantics for stream `prop` events and partial reloads (partial reload replaces only the returned keys).

---

## 13. Lazy / deferred architecture

| Wrapper                    | Full Page load                            | Partial reload with key | JSON mode                 | Purpose                                                     |
| -------------------------- | ----------------------------------------- | ----------------------- | ------------------------- | ----------------------------------------------------------- |
| `Bridge::lazy(fn)`         | excluded                                  | included                | excluded unless requested | Expensive data fetched on demand (e.g. a modal).            |
| `Bridge::defer(fn, group)` | excluded; key listed in `deferred[group]` | included                | included inline           | Render the page fast, load heavy widgets right after mount. |
| `Bridge::always(v)`        | included                                  | always included         | included                  | Data that must be present in every response (e.g. `auth`).  |
| plain / closure            | included                                  | included when selected  | included                  | Default.                                                    |

Client: after mounting a page with `deferred`, `router.reload({ only: keys, headers: {X-Bridge-Component} })` per group in parallel. `<Deferred :data="['stats']">` renders a fallback until those keys exist. If the user navigates away first, in-flight deferred requests are aborted.

---

## 14. Forms

`useForm` / `createForm`:

- State: `data`, `errors`, `processing`, `progress`, `wasSuccessful`, `recentlySuccessful`, `isDirty`, `hasErrors`.
- Methods: `submit(method, url, options)`, `get/post/put/patch/delete`, `reset(...keys)`, `setError`, `clearErrors`, `transform(fn)`, `defaults()`, `cancel()`.
- Submission goes through the router (so redirects, 409, 406 behave as navigations) with `only`, `preserveState`, `preserveScroll`, `onBefore/onStart/onProgress/onSuccess/onError/onFinish` hooks.
- CSRF: `X-XSRF-TOKEN` read from the `XSRF-TOKEN` cookie (Laravel-native, no template injection). For token-authenticated clients no CSRF is needed (§21.3).
- Errors: a 422 Page error attaches `errors` to the form that submitted, without touching the page store. This is why named error bags are unnecessary: each form owns its errors.
- `remember`: form data is stored in history state so back-navigation restores it.

---

## 15. Validation

Server: any `ValidationException` (from `FormRequest`, `$request->validate()`, or thrown manually) is mapped by `ErrorMapper` to `ErrorEnvelope{422, validation}`.

| Mode                                       | Result                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| html (no Bridge client, classic form post) | Laravel default: redirect back with `errors` in session; the next HTML page's embedded page object includes the `errors` shared prop. |
| page                                       | `422` Bridge error object. No redirect, no session write.                                                                             |
| json                                       | `422` Laravel-native `{message, errors}`.                                                                                             |
| stream                                     | `bridge` `error` event with `kind: validation` (only reachable from one-off producer streams).                                        |

Rationale for abandoning redirect-back in Page mode: fewer round trips, no dependency on session flash (works with bearer tokens and with multiple tabs), no cross-form error bag leakage, and identical semantics to JSON mode, which simplifies mobile SDKs.

Precognition (`precognitive` middleware) works unchanged because it returns before the controller; Bridge only adds the `Accept` header, and the Vue form exposes `validate(field)` using Laravel's `Precognition` header in Phase 4.

---

## 16. File uploads

- Forms containing `File`/`Blob`/`FileList` values are sent as `multipart/form-data` (nested keys flattened to `a[b][0]`), method-spoofed for PUT/PATCH/DELETE.
- Upload progress uses `XMLHttpRequest` (fetch upload progress is not reliably available). All other requests use `fetch`. Both paths share `responseParser`.
- Server side is untouched Laravel (`$request->file()`, validation rules). Response is the usual `Bridge::redirect()`.
- Large uploads: documentation recommends chunked/direct-to-storage flows (signed S3 URLs) which are outside Bridge; the playground demonstrates a plain avatar upload.

---

## 17. Partial reload

Request:

```http
GET /customers
Accept: application/vnd.bridge+json; v=1
X-Bridge-Only: customers,stats
X-Bridge-Component: Customers/Index
```

Response contains only `customers`, `stats`, and `always` props. The client merges into the current page **only if** `component` matches; otherwise it treats the response as a full page swap. `X-Bridge-Except` is the complement. Both headers are part of `Vary`.

Why headers and not query parameters: query params leak into history, bookmarks, logs, and cache keys of unrelated caches; headers keep the URL identical for the full and partial representation, which is the same resource. `Prefer` (RFC 7240) was considered but its semantics are advisory and intermediaries may strip it; a dedicated header is clearer for mobile SDK authors.

JSON clients may use the same headers to trim payloads.

---

## 18. Prefetch

- `<BridgeLink prefetch>` (default trigger `hover` with a 75 ms delay; `mount` for above-the-fold links; `false` to disable).
- `router.prefetch(url, { only })` populates `PageCache` with `{ page, fetchedAt }`. TTL default 30 s; `staleWhileRevalidate` default 30 s more (serve cached, re-fetch in background, patch when it arrives).
- Cache key: URL + sorted partial headers. Cache is cleared on any non-GET visit (mutations), on 401/403/409, and on `bridge.cache.clear()`; apps should call it on logout.
- Server-side, prefetches are ordinary Page requests. A `Purpose: prefetch` header is sent so apps can skip analytics; it is a standard-ish header (used by browsers) and not required by the protocol.
- Prefetching never applies to non-GET or to responses that carried `Cache-Control: no-store`.

---

## 19. JSON / mobile architecture

- A mobile client is an HTTP client that sends `Accept: application/json` and `Authorization: Bearer …` (Sanctum personal access token, Passport, or any guard). No Bridge SDK is required; §34 describes an optional one.
- Same routes, same controllers, same policies. Route middleware decides guards: the recommended setup is `auth:sanctum` on the shared routes (Sanctum authenticates both session cookies from the SPA and bearer tokens from mobile).
- Pagination, resources, and errors are Laravel-native, so existing mobile teams recognise the shapes.
- Deferred props resolve inline; lazy props are opt-in through `X-Bridge-Only`.
- Mutations return `Location` + `{ data, meta.location }` rather than a redirect body, so mobile clients never follow HTML redirects.
- Rate limiting, versioning, and CORS are the app's ordinary Laravel concerns. Bridge sets no CORS headers.

---

## 20. SSE architecture

### 20.1 Components

```
Publisher (any process: web request, queue worker, scheduler)
   │  Bridge::to(channels)->invalidate(...)
   ▼
EventBus driver  ── sync | redis (Streams) | database
   ▲
   │  subscribe(channels, since, blockMs)
StreamResponse (one per connected client, inside a web worker)
   │  StreamWriter → text/event-stream
   ▼
Client StreamClient (fetch or EventSource) → PageStore / app handlers
```

### 20.2 Bus contract

```php
interface EventBus
{
    /** @return string the assigned event id */
    public function publish(array $channels, Envelope $envelope): string;

    /**
     * Block up to $blockMs for new envelopes on $channels after $since.
     * @return iterable<Envelope>  possibly empty on timeout
     */
    public function read(array $channels, ?Cursor $since, int $blockMs): iterable;

    public function supportsReplay(): bool;
    public function latestCursor(array $channels): ?Cursor;
}
```

| Driver     | Mechanism                                                                                                                   | Replay                 | Blocking                 | Use                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------ | ------------------------------- |
| `sync`     | In-process array                                                                                                            | yes (process lifetime) | no (returns immediately) | tests, one-off producer streams |
| `redis`    | One Redis Stream per channel (`bridge:stream:{channel}`, `XADD MAXLEN ~ 1000`), `XREAD BLOCK` across all subscribed streams | yes, by id             | yes                      | production default              |
| `database` | `bridge_stream_events` table, polling every `poll_ms` (default 1000), `bridge:stream:prune` command                         | yes, by id             | simulated (sleep loop)   | shared hosting, no Redis        |
| `null`     | discards                                                                                                                    | n/a                    | n/a                      | disable publishing              |

Redis Pub/Sub was rejected as the default: no replay, no `Last-Event-ID` support, and phpredis `subscribe` blocks without a timeout, which prevents heartbeats and duration limits. Streams cost slightly more memory (bounded by MAXLEN) and give ordering and replay for free.

### 20.3 Stream loop (server)

```
headers: Content-Type: text/event-stream; charset=utf-8
         Cache-Control: no-cache, no-transform
         X-Accel-Buffering: no
         Connection: keep-alive        (HTTP/1.1 only; omitted on HTTP/2)
disable output buffering, zlib compression, set_time_limit(0), ignore_user_abort(false)
write retry:, then ready{replayed}
if Last-Event-ID and bus supports replay: read since id, write, advance cursor
deadline = now + max_duration
loop:
   block = min(heartbeat_ms, ms until deadline, ms until next heartbeat due)
   envelopes = bus->read(channels, cursor, block)
   for each: authorize channel again (cached per connection), write event, cursor = id
   if heartbeat due: write ": hb"
   flush; if connection_aborted(): break
   if now >= deadline: write end{reason: max_duration, reconnect: true}; break
finally: ConnectionLimiter->release(user)
```

Defaults: `heartbeat = 15s`, `max_duration = 60s` (PHP-FPM) / `300s` (Octane, detected), `retry = 3000ms`.

### 20.4 Deployment guidance (to be written into docs, summarized here)

| Runtime                   | Assessment                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PHP-FPM + Nginx           | Works. One FPM child per open stream. Size `pm.max_children` ≥ expected concurrent streams + normal traffic headroom, or route `/events` to a **dedicated FPM pool**. Nginx: `proxy_buffering off; proxy_read_timeout > max_duration; gzip off` for the location (Bridge also sends `X-Accel-Buffering: no`). `bridge:doctor` checks `output_buffering`, `zlib.output_compression`, and `max_execution_time`. |
| Apache mod_php / php-fpm  | Same as above; disable `mod_deflate` for `text/event-stream`.                                                                                                                                                                                                                                                                                                                                                 |
| Caddy                     | Flushes by default; set `flush_interval -1` for the reverse proxy.                                                                                                                                                                                                                                                                                                                                            |
| FrankenPHP (worker mode)  | Recommended. Cheaper per-connection cost than FPM; still one worker thread per stream. Raise `max_duration`.                                                                                                                                                                                                                                                                                                  |
| Octane Swoole/RoadRunner  | Works with `StreamedResponse`; one worker per stream. Do not use coroutine tricks in v1.                                                                                                                                                                                                                                                                                                                      |
| Queue workers / scheduler | Publish only. They never hold streams.                                                                                                                                                                                                                                                                                                                                                                        |
| Redis                     | Optional but recommended bus.                                                                                                                                                                                                                                                                                                                                                                                 |

Bounded `max_duration` is the key to FPM viability: workers are recycled every minute, deploys never wait on hour-long connections, and the client's reconnect with `Last-Event-ID` is invisible to the user.

Future (out of v1): a standalone relay (`bridge-relay`, Go or Node) that subscribes to the same Redis Streams and serves SSE directly, authenticating via a Laravel-issued signed stream ticket. The protocol already permits this because publishing is fully decoupled.

### 20.5 Client reconnect algorithm

1. On close/error (not `final`), wait `min(max, initial × factor^attempt) × (1 ± jitter)`, honoring a server `retry:` value as the initial delay.
2. Reconnect with `Last-Event-ID` (header for fetch; automatic for EventSource).
3. On `ready{replayed:false}` after a reconnect: resync (reload watched keys, or `invalidate:"*"` when `handleControl`).
4. Heartbeat watchdog: no bytes for `heartbeatTimeout × heartbeat` ⇒ abort and reconnect.
5. `visibilitychange` to visible and `online` events trigger immediate reconnect if not open; hidden tabs keep the stream by default (`pauseWhenHidden: false`).
6. `end{reconnect:true}` reconnects without backoff.

---

## 21. Authentication

### 21.1 Principle

Bridge does not authenticate. Guards run as route middleware, before the controller, unaware of the mode. Bridge only maps `AuthenticationException` to the right shape.

| Client           | Mechanism                                     | Page/JSON                                           | SSE                                                                          |
| ---------------- | --------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Browser SPA      | Session cookie (+ Sanctum SPA mode if wanted) | `credentials: same-origin`, CSRF via `X-XSRF-TOKEN` | fetch transport with cookies, or native `EventSource` with `withCredentials` |
| Mobile           | Sanctum PAT / Passport bearer                 | `Authorization: Bearer`                             | fetch-style SSE client with header, or signed stream ticket (§21.2)          |
| External service | API token / OAuth client credentials          | `Authorization: Bearer`                             | same as mobile                                                               |

### 21.2 SSE and native `EventSource`

Browsers cannot set headers on `EventSource`, so bearer tokens would need to travel in the URL. Bridge's answer:

1. **Default: fetch-based transport** that sets `Authorization` like any request. Cost: manual reconnect logic (implemented in core), no browser-level `Last-Event-ID` (implemented in core).
2. **Native `EventSource` option** for cookie-authenticated apps (zero-cost reconnects by the browser).
3. **Signed stream tickets** for clients that must use `EventSource` with token auth: `POST /bridge/stream-ticket` (authenticated with the bearer token) returns a `URL::temporarySignedRoute` for the stream valid for 60 s, bound to the user id and requested channels. The ticket is single-purpose, short-lived and useless for any other endpoint, which is the "strong justification" the brief requires. Long-lived bearer tokens never appear in URLs.

### 21.3 CSRF with a single route mount

`VerifyCsrfToken` in the `web` group would reject bearer-authenticated mobile requests to shared routes. Options:

- **Recommended:** replace `VerifyCsrfToken` with `Bridge\Http\Middleware\VerifyCsrfToken`, which skips verification only when the request has `Authorization: Bearer …` **and** carries no session cookie. Cross-site attackers cannot set an `Authorization` header from a form, so this preserves CSRF protection for cookie sessions exactly.
- **Alternative:** mount the same routes file twice (`Route::middleware('web')->group(...)` and `Route::prefix('api')->middleware('auth:sanctum')->group(...)`) via `Bridge::routes($path)`; URLs differ but controllers do not.

### 21.4 Session expiry in the SPA

401 in Page mode → error object with `redirect` (from `bridge.auth.login_url` or the `Authenticate::redirectTo()` result); client navigates there. 419 (CSRF mismatch) → `kind: csrf`; client hard-reloads to refresh the token.

---

## 22. Authorization

- Policies, gates, and `authorize()` calls run in controllers as usual. `AuthorizationException` → `ErrorEnvelope{403, forbidden}`.
- Props are computed inside the authorized request, so Page and JSON never expose more than the controller returns.
- Stream channels: server-computed lists plus `Bridge::channel()` authorizers for client-requested channels. Authorization is re-evaluated on every (re)connection and cached for the connection's lifetime; `max_duration` bounds how long a revoked user can keep receiving events (60 s default).
- `invalidate` events carry keys only. Re-fetch goes through the controller and its policies, so an event on a broad channel (`customers`) cannot leak rows the user may not see.
- `prop` and application events carry data. Documentation states plainly: only publish data to channels whose every subscriber may see it (per-user or per-tenant channels), never to broad channels.

---

## 23. Security

| Concern                     | Mitigation                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE authentication          | Ordinary guards; fetch transport with headers; signed 60 s tickets for `EventSource`; no long-lived tokens in URLs.                                                                                                                        |
| JSON API authentication     | Laravel guards; Bridge never bypasses.                                                                                                                                                                                                     |
| CSRF                        | Laravel's cookie/header scheme; Bridge CSRF middleware variant only skips for bearer-without-session (§21.3). Streams are GET and never mutate.                                                                                            |
| CORS                        | Not handled by Bridge; app uses `HandleCors`. Docs warn that `credentials: include` requires explicit origins.                                                                                                                             |
| Open redirects              | `X-Bridge-Location` is only emitted from app-controlled redirects. The client refuses `navigate` events to other origins unless `allowExternalNavigate` is set. Redirect builder validates same-origin for `->to()` unless `->external()`. |
| Cache poisoning             | Page/JSON default `private, no-cache`; `Vary` on all negotiation headers; `public` caching refused when a user is authenticated unless `force: true`; docs on CDN cache keys including `Accept`.                                           |
| Private data caching        | Embedded shell `Cache-Control: private, no-store` when a user is authenticated; client `PageCache` cleared on logout/401/403.                                                                                                              |
| Event leakage               | Invalidate-first; channel authorizers; server-computed channels; no client-controlled channel names without authorization.                                                                                                                 |
| Tenant isolation            | Channel naming convention `tenant.{id}`; authorizer required for pattern channels; bus keys prefixed with `bridge.stream.prefix` (default app name) so multiple apps can share Redis.                                                      |
| Replay                      | `Last-Event-ID` replay is filtered by currently authorized channels; ids are opaque cursors, not guessable secrets, and grant nothing by themselves.                                                                                       |
| Connection exhaustion / DoS | `max_duration`; `ConnectionLimiter` per user (default 3 concurrent); `throttle:bridge-stream` limiter (default 30 connects/min per user or IP); docs for `limit_conn` at Nginx; `bridge:doctor` warns when `pm.max_children` is small.     |
| Rate limiting               | Ordinary `throttle` for Page/JSON; publishing is unthrottled server-side but the client coalesces invalidations.                                                                                                                           |
| Deserialization             | Client validates `Content-Type` and `type` before applying a response; unknown control types are ignored.                                                                                                                                  |
| Debug leakage               | `exception`/`trace` only when `app.debug`; SSE never includes traces.                                                                                                                                                                      |

A `SECURITY.md` with a disclosure process is part of Phase 0.

---

## 24. Caching

Defaults set by `HandleBridgeRequests`/representers, overridable per response via `->cache(...)`:

| Mode                           | Default headers                                                                                                                    | Notes                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| html (embedded, authenticated) | `Cache-Control: private, no-store`                                                                                                 | Page data is in the document.                                                                                   |
| html (embedded, guest)         | `Cache-Control: private, no-cache` + weak `ETag`                                                                                   | Conditional GET allowed.                                                                                        |
| html (static shell)            | `Cache-Control: public, max-age=300, must-revalidate` + `ETag`                                                                     | Shell contains no data; CDN-safe.                                                                               |
| page                           | `Cache-Control: private, no-cache` + weak `ETag` over the body; `Vary: Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component` | `If-None-Match` → 304 saves bandwidth, not latency.                                                             |
| json                           | same as page                                                                                                                       | Public caching opt-in: `->cache(public: true, maxAge: 60)`; refused when a user is authenticated unless forced. |
| stream                         | `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`                                                                   | Never cacheable.                                                                                                |

`Last-Modified` is supported when the app provides it (`->lastModified($carbon)`); Bridge does not guess it.

Authenticated browser vs mobile: identical server headers (`private`). Browsers additionally have the client `PageCache` (in-memory, short TTL). Mobile clients are told in docs to use `ETag`/`If-None-Match` and to treat `private` as "device-local cache only".

---

## 25. Performance and benchmarks

`benchmarks/` contains reproducible, containerized benchmarks. No performance claim enters the docs without a `RESULTS.md` entry with hardware, versions, and command.

Setup:

- `benchmarks/apps/inertia-baseline`: the playground's Customers pages rebuilt with Inertia (same models, seed, and Vue components).
- `benchmarks/apps/bridge`: the playground.
- `docker-compose.yml`: PHP-FPM + Nginx, FrankenPHP, Redis, MySQL, a k6 runner, a Lighthouse CI runner.
- Seeds: 10k customers, deterministic.

Scenarios and metrics:

| Scenario                                     | Tool                           | Metrics                                                                                                                                     |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| First load `/customers` (HTML)               | Lighthouse CI (5 runs, median) | HTML size, TTFB, FCP, LCP, request count                                                                                                    |
| SPA navigation `/customers` → `/customers/1` | Playwright trace + k6          | navigation latency (p50/p95), JSON size, JSON parse time (Performance API)                                                                  |
| Page JSON vs JSON mode vs Inertia page       | k6, 50 VUs, 60 s               | req/s, p95 latency, CPU (`docker stats`), memory                                                                                            |
| Serialization cost                           | PHP micro-benchmark (phpbench) | ms per 1k-row resource collection, per mode                                                                                                 |
| SSE                                          | k6 (`k6/x/sse`)                | concurrent connections sustained per FPM pool size, event delivery latency publish→client, memory per connection, reconnect storm behaviour |
| Partial reload                               | k6                             | payload size vs full page                                                                                                                   |

Expected outcome to verify, not assume: Bridge Page ≈ Inertia in size and latency (the protocol is similar in weight), JSON mode slightly smaller (no `component`/`url`), embedded shell faster to FCP than static-shell mode by one RTT.

---

## 26. SSR / SEO

Not in v1 core scope; designed so it is additive (Phase 5):

- `Bridge\Ssr\HttpSsrGateway` posts the page object to a Node SSR server (`bridge-ssr`, built with Vite SSR from `@swarakaka/bridge-vue/server`), receives `{ head: string[], body: string }`, and the HTML shell inlines them.
- Failures fall back to client-only rendering (logged, never fatal).
- JSON and SSE are unaffected.
- Without SSR, crawlers that execute JS see the app; those that do not see the shell and `<noscript>`. Docs are explicit about which pages need SSR.

---

## 27. Playground

`playground/` is a full Laravel app (Vite + Vue) that depends on the packages by path. It is the manual verification environment and the target of E2E tests.

Pages:

- `Dashboard` — shared props, deferred `stats` group, `<Deferred>` fallback, `useProp` example.
- `Customers/Index` — pagination via `ResourceCollection`, search with partial reload (`only: ['customers']`), prefetch links, lazy `filters` prop.
- `Customers/Create`, `Customers/Edit` — `useForm`, validation errors, avatar upload with progress, method spoofing.
- `Customers/Show` — single resource, delete with confirmation, `Bridge::redirect()->created()` flow.
- `Realtime` — `useStream('/events')`: connection state badge, last heartbeat time, reconnect counter, live event log, notification toasts, `prop` push demo (`unreadCount`), invalidation demo (create a customer in tab A, list updates in tab B), a "kill connection" button that calls a dev-only route to end the server stream and shows reconnect.
- `Json` — a documentation page with a built-in client: select a route, choose `Accept`, see request headers, response headers and body; curl snippets for each mode. Also shows the 406 for a stream route requested as HTML.
- `Auth` — login/logout (session), and an "issue Sanctum token" page so the JSON demo can run with a bearer token. `Authorization` demo: a policy-protected customer that returns 403 in each mode.
- `Errors` — links that trigger 404, 403, 419, 500 in each mode; error components `Errors/404.vue` etc.

Manual verification checklist (kept as `playground/CHECKLIST.md`): HTML, Page, JSON, SSE, forms, validation, navigation, partial reload, deferred props, file upload, authentication, authorization, build-version 409, reconnect, heartbeat.

Dev commands: `pnpm play` (runs `php artisan serve`, `vite`, `php artisan queue:work`, and a Redis container via docker compose). `.env.example` uses `BRIDGE_STREAM_DRIVER=database` so it works without Redis on first run.

---

## 28. Repository structure

```
Bridge/
├── packages/
│   ├── laravel/                 swarakaka/bridge-laravel  (composer; its own tests/ with Pest)
│   ├── protocol/                @swarakaka/bridge-protocol  (spec, JSON Schemas, fixtures, generated TS types)
│   ├── core/                    @swarakaka/bridge-core       (framework-agnostic TS runtime, Vitest)
│   └── vue/                     @swarakaka/bridge-vue        (Vue bindings, Vitest + @vue/test-utils)
├── playground/                  Laravel + Vue app; depends on packages via path repositories / workspace
├── e2e/                         Playwright project targeting the playground
├── benchmarks/                  k6, Lighthouse CI, phpbench, inertia-baseline app, docker-compose, RESULTS.md
├── docs/                        VitePress site + propmts.md + PLAN.md (this file)
├── .github/workflows/           ci.yml, e2e.yml, benchmarks.yml (manual), release.yml
├── composer.json                root: path repos + scripts for CI convenience (not published)
├── package.json                 pnpm workspace root, scripts (build, test, lint, play)
├── pnpm-workspace.yaml
├── tsconfig.base.json  .editorconfig  .prettierrc  eslint.config.js  phpstan.neon  pint.json
├── README.md  LICENSE (MIT)  SECURITY.md  CONTRIBUTING.md  CHANGELOG.md  CODE_OF_CONDUCT.md
└── .changeset/                  changesets for npm packages; Laravel package version tracked in CHANGELOG
```

Changes from the brief's proposal: a separate `core/` package (required for React/mobile reuse), no root `tests/` (tests live with their packages; E2E has its own `e2e/` with different tooling), `protocol/` promoted to the contract that both sides test against.

---

## 29. File-by-file implementation plan

### 29.1 `packages/protocol`

| File                                                                                                                                                                                                       | Content                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `spec/negotiation.md`                                                                                                                                                                                      | §5 verbatim, normative.                                                             |
| `spec/page.md`, `spec/json.md`, `spec/stream.md`, `spec/errors.md`, `spec/headers.md`, `spec/versioning.md`                                                                                                | Normative protocol text.                                                            |
| `schemas/page.schema.json`, `error.schema.json`, `redirect-json.schema.json`, `stream-control.schema.json`                                                                                                 | JSON Schema 2020-12.                                                                |
| `fixtures/page/{full,partial,deferred,shared}.json`, `fixtures/error/{validation,unauthenticated,...}.json`, `fixtures/json/{collection,single,redirect}.json`, `fixtures/stream/{session,replay,end}.txt` | Golden files.                                                                       |
| `src/index.ts`                                                                                                                                                                                             | Generated types + hand-written type guards (`isPage`, `isError`, `isControlEvent`). |
| `package.json`, `tsconfig.json`, `scripts/generate-types.ts`                                                                                                                                               | Build.                                                                              |

### 29.2 `packages/laravel`

```
composer.json  phpunit.xml  phpstan.neon  pint.json
config/bridge.php                                   (Appendix C)
database/migrations/create_bridge_stream_events_table.php
resources/views/app.blade.php                       (default shell, publishable)
routes/bridge.php                                   (stream-ticket route, optional)
src/
  Bridge.php                      BridgeServiceProvider.php     Facades/Bridge.php
  Negotiation/ContentNegotiator.php  AcceptHeader.php  MediaRange.php  Mode.php  Negotiation.php
  Http/Middleware/HandleBridgeRequests.php  VerifyCsrfToken.php
  Http/Responses/PageResponse.php  RedirectBuilder.php
  Http/Controllers/StreamTicketController.php
  Page/Page.php  PropBag.php
  Props/Lazy.php  Deferred.php  Always.php  Merge.php  PropResolver.php  Serializer.php
  Representation/Representer.php  RepresenterRegistry.php  HtmlRepresenter.php  PageRepresenter.php  JsonRepresenter.php
  Errors/ErrorEnvelope.php  ErrorKind.php  ErrorMapper.php  ExceptionRenderer.php
  Stream/StreamResponse.php  StreamWriter.php  StreamMessage.php  Publisher.php  ChannelAuthorizer.php  ConnectionLimiter.php
  Stream/Contracts/EventBus.php  ShouldStream.php
  Stream/Bus/Envelope.php  Cursor.php  BusManager.php  SyncBus.php  RedisStreamsBus.php  DatabaseBus.php  NullBus.php
  Stream/Listeners/PublishStreamableEvents.php
  Support/Version.php  Support/Headers.php (constants)  Support/RequestMacros.php
  Testing/BridgeTestingMacros.php  AssertablePage.php  AssertableStream.php
  Console/InstallCommand.php  DoctorCommand.php  PruneStreamEventsCommand.php
  Ssr/SsrGateway.php  HttpSsrGateway.php  NullSsrGateway.php          (Phase 5)
tests/
  Unit/Negotiation/*  Unit/Props/*  Unit/Errors/*  Unit/Stream/Bus/*
  Feature/HtmlModeTest  PageModeTest  JsonModeTest  StreamModeTest  RedirectTest  ValidationTest
  Feature/PartialReloadTest  DeferredPropsTest  SharedPropsTest  BuildVersionTest  CachingTest  AuthTest
  Feature/Stream/{Publish,Subscribe,Replay,ChannelAuthorization,ConnectionLimit}Test
  Conformance/ProtocolFixturesTest      (validates output against packages/protocol schemas + fixtures)
```

### 29.3 `packages/core`

```
src/index.ts  createBridge.ts  config.ts
src/http/RequestManager.ts  headers.ts  responseParser.ts  csrf.ts  formData.ts  xhrUpload.ts
src/router/Router.ts  History.ts  Scroll.ts  Visit.ts (types + lifecycle)  url.ts
src/pages/PageStore.ts  applyControl.ts  merge.ts
src/forms/createForm.ts  errors.ts
src/stream/StreamClient.ts  transports/fetchTransport.ts  transports/eventSourceTransport.ts  sseParser.ts  backoff.ts  watchdog.ts
src/cache/PageCache.ts
src/events/Emitter.ts
src/errors.ts   (BridgeError classes)
tests/**  (Vitest + msw for HTTP; a small in-memory SSE server for stream tests; conformance tests over protocol fixtures)
```

### 29.4 `packages/vue`

```
src/index.ts  createBridgeApp.ts  plugin.ts  injection.ts
src/composables/usePage.ts  useProp.ts  useForm.ts  useStream.ts  useRemember.ts  useDeferred.ts
src/components/BridgeLink.ts  BridgeHead.ts  Deferred.ts
src/server/index.ts   (createServer for SSR, Phase 5)
tests/**  (Vitest + @vue/test-utils)
```

### 29.5 `playground`

Standard Laravel skeleton plus: `app/Http/Controllers/{Dashboard,Customer,Realtime,JsonDemo,Auth,Token,Error}Controller.php`, `app/Http/Resources/CustomerResource.php`, `app/Events/CustomerCreated.php` (`ShouldStream`), `app/Policies/CustomerPolicy.php`, `routes/web.php`, `database/{migrations,factories,seeders}`, `resources/js/{app.ts, Pages/**, Components/**, Layouts/**}`, `resources/views/app.blade.php`, `CHECKLIST.md`, `docker-compose.yml`.

### 29.6 `e2e`

`playwright.config.ts`, `tests/{navigation,forms,validation,upload,partial-reload,deferred,json-mode,auth,errors,realtime}.spec.ts`, `fixtures/{login,seed}.ts`. Realtime spec uses two browser contexts.

### 29.7 Root

`package.json` scripts: `build`, `test`, `test:php`, `test:e2e`, `lint`, `play`, `bench`. `composer.json` root with `repositories` path entries. Workflows in §31.

---

## 30. Testing strategy

| Layer                       | Tooling                                                     | Coverage targets                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Laravel unit                | Pest                                                        | Accept parsing (q-values, wildcards, params, malformed), negotiation precedence matrix, prop resolution (only/except/lazy/defer/always, nested), serializer for every supported value type, error mapping for every exception, bus drivers (sync, redis via `predis`/phpredis in CI service, database).                                                                                                     |
| Laravel feature             | Pest + Orchestra Testbench                                  | Each mode end-to-end for `render`, `redirect`, validation, errors (401/403/404/419/429/500), shared props, partial reload with component mismatch, deferred groups, build 409, caching headers/ETag/304, CSRF variant middleware, stream: publish→subscribe, replay with `Last-Event-ID`, channel authorization, connection limiter, max_duration `end` event, heartbeat timing (sync bus with fake clock). |
| Conformance                 | Pest + Vitest                                               | Both sides validate the same JSON Schemas and golden fixtures. PHP generates responses and asserts equality with fixtures; TS parses fixtures and asserts typed results.                                                                                                                                                                                                                                    |
| Core unit                   | Vitest + msw                                                | Request headers, response classification, 409/406 handling, router lifecycle and abort, history/scroll, form state machine, multipart building, PageCache TTL/SWR, SSE parser (chunk boundaries, CRLF, comments, multi-line data), backoff with fake timers, watchdog, control dispatch.                                                                                                                    |
| Vue                         | Vitest + @vue/test-utils                                    | `createBridgeApp` mount from embedded page and bootstrap mode, `usePage/useProp` reactivity, `useForm` errors, `useStream` cleanup on unmount, `BridgeLink` prefetch triggers, `Deferred`.                                                                                                                                                                                                                  |
| SSE integration (real HTTP) | Vitest in `playground` (`tests/integration/stream.test.ts`) | Boots `php artisan serve` (and optionally Octane) with `database` and `redis` drivers, opens a real stream with Node `fetch`, publishes via an HTTP dev route, asserts delivery order, ids, heartbeat comments, `end` after a short `max_duration`, replay after reconnect.                                                                                                                                 |
| E2E                         | Playwright                                                  | All playground pages in Chromium + WebKit; realtime spec with two contexts (A creates → B's list updates within 2 s); reconnect after the dev "kill" route; JSON demo page; no-JS shell renders `<noscript>`.                                                                                                                                                                                               |
| Static analysis             | PHPStan level 8, Pint, ESLint, TypeScript strict, `vue-tsc` | Enforced in CI.                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 31. CI/CD

`ci.yml` (push, PR):

- `php`: matrix PHP 8.2/8.3/8.4 × Laravel 11/12; services Redis, MySQL; Pint check, PHPStan, Pest with coverage; conformance tests.
- `js`: Node 20/22; pnpm install (frozen), build protocol → core → vue, ESLint, `vue-tsc`, Vitest with coverage.
- `playground`: composer + pnpm install, migrate, `vite build`, integration stream tests (database + redis drivers).

`e2e.yml` (PR label `e2e` and nightly): Playwright against the playground under PHP-FPM/Nginx docker image and under FrankenPHP.

`benchmarks.yml` (manual dispatch): runs `benchmarks/run.sh`, uploads `RESULTS.json` as artifact, comments a summary on the PR if any.

`release.yml`: changesets → npm publish for `@swarakaka/*`; Laravel package tagged separately (`laravel-v1.x`) and published via Packagist webhook. Protocol version and package versions are documented in `docs/versioning.md`.

Branch protection: CI green, one review, conventional commits enforced by commitlint.

---

## 32. Documentation

VitePress in `docs/`:

1. Introduction, comparison with Inertia (what is similar, what is deliberately different).
2. Installation (`composer require`, `bridge:install`, Vite setup).
3. Concepts: modes, negotiation, representation vs transport.
4. Pages and props (shared, lazy, deferred, always, merge).
5. Navigation, links, prefetch, partial reloads, history.
6. Forms, validation, uploads.
7. JSON mode and mobile clients (curl cookbook, Sanctum setup, CSRF middleware choice).
8. Real-time: publishing, channels, authorization, client API, deployment guide per runtime, sizing guide, `bridge:doctor`.
9. Errors across modes.
10. Caching.
11. Security.
12. Testing helpers.
13. Protocol reference (rendered from `packages/protocol/spec`).
14. Writing an adapter (React, mobile).
15. Benchmarks (auto-included `RESULTS.md`).
16. Upgrade and versioning policy.

---

## 33. Future React adapter

`@swarakaka/bridge-react` will depend on `@swarakaka/bridge-core` and provide `createBridgeApp` (React root), `usePage`, `useProp` (via `useSyncExternalStore` on `PageStore`), `useForm`, `useStream`, `<BridgeLink>`, `<Deferred>`. Because negotiation, headers, router, forms, stream client, and cache live in core, the React package is bindings only. The Laravel package is untouched; the conformance fixtures guarantee the React adapter is testable without a server.

Adapter contract (documented in `docs/adapters.md`): an adapter must (1) read the embedded page or bootstrap, (2) subscribe to `PageStore`, (3) resolve components by name, (4) render errors via `resolveError`, (5) expose form and stream bindings. Nothing else is adapter-specific.

---

## 34. Future mobile SDKs

The JSON and SSE specs in `packages/protocol` are sufficient for Flutter/React Native/Swift/Kotlin SDKs. A minimal SDK needs: an HTTP client that sets `Accept: application/json` and bearer auth; optional `X-Bridge-Only`; an SSE client with `Last-Event-ID`, backoff, heartbeat watchdog (all `text/event-stream` libraries provide most of this); parsing of the `bridge` control event (`invalidate`, `notification`, `progress`, `error`, `end`); and the signed stream ticket flow if the platform's SSE client cannot set headers. Golden fixtures let SDK authors test parsers offline. A React Native SDK can reuse `@swarakaka/bridge-core` directly.

---

## 35. Risks

| Risk                                                                      | Impact                   | Mitigation                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| PHP worker exhaustion from SSE under load                                 | Site-wide outage         | `max_duration`, per-user cap, throttle, dedicated pool guidance, `bridge:doctor`, relay path in roadmap.               |
| CDN ignoring `Vary: Accept` serves JSON to browsers                       | Broken pages             | `private` defaults; docs; optional `bridge.negotiation.cache_key_query` escape hatch if real-world reports justify it. |
| Proxy buffering breaks SSE silently                                       | Real-time "does nothing" | `X-Accel-Buffering: no`, `bridge:doctor` end-to-end check that measures first-byte delay of the stream.                |
| Deviation from Inertia semantics confuses adopters (422 vs redirect-back) | Learning curve           | Explicit comparison page; the difference is one paragraph.                                                             |
| Database bus polling latency and load                                     | Slow events, DB load     | Default only for dev/small; clear guidance to use Redis.                                                               |
| Scope creep (SSR, React, relay)                                           | Delays v1                | Phases and V1 scope fixed in §37/§39.                                                                                  |
| Laravel major version changes to exception rendering                      | Breakage                 | Renderer registered via the documented `Exceptions::render` hook; CI matrix.                                           |
| `fetch`-based SSE on iOS Safari background tabs                           | Dropped streams          | Watchdog + visibility reconnect; native `EventSource` transport available.                                             |

---

## 36. Alternatives considered

| Decision                       | Alternative                                      | Why rejected                                                                                                                    |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `Accept`-only negotiation      | `X-Bridge` marker header (as in the brief)       | Redundant with a dedicated media type; adds a `Vary` dimension; no scenario needs it.                                           |
| Media type parameter `v=1`     | `application/vnd.bridge.v1+json` suffix versions | Multiplies media types, complicates parsing and `Vary`; parameters are the RFC-sanctioned mechanism.                            |
| Reuse Laravel `JsonResource`   | Bridge resource layer                            | Would duplicate serialization, `with`/`additional`, conditional attributes, and pagination; no missing capability justifies it. |
| `{ data, meta }` JSON envelope | JSON:API                                         | Heavy, opinionated, and foreign to most Laravel apps; can be layered by apps that want it.                                      |
| `{ data, meta }` JSON envelope | Bare props with no envelope                      | Loses a place for `location`/`flash`; inconsistent with Laravel resource collections.                                           |
| 422 in Page mode               | Redirect-back with session flash (Inertia)       | Session dependency, extra round trip, error bag juggling; breaks stateless clients.                                             |
| Invalidate-first SSE           | Prop push as the primary model                   | Data on the bus bypasses policies and serialization context; ordering and staleness problems; larger fan-out cost.              |
| Redis Streams bus              | Redis Pub/Sub                                    | No replay/`Last-Event-ID`; blocking subscribe prevents heartbeats and duration limits.                                          |
| Fetch-based SSE client default | Native `EventSource` only                        | Cannot set `Authorization`; would force tokens into URLs.                                                                       |
| Embedded initial props         | Static shell + bootstrap request only            | One extra RTT for private data that HTTP caching cannot avoid; static shell kept as an option.                                  |
| Custom `X-Bridge-Only`         | `Prefer` header or query params                  | See §17.                                                                                                                        |
| SSE in core                    | Separate package                                 | Negotiator, error mapping, and protocol version must evolve together; drivers are small.                                        |
| Reverb as bus backend          | —                                                | Reverb is a WebSocket server, not a message store; possible future client transport, not a bus.                                 |
| Separate `core` TS package     | Everything in `vue`                              | Blocks React/RN reuse; Inertia's split proved the value.                                                                        |

---

## 37. Implementation phases

### Phase 0 — Repository and tooling (1 week)

Monorepo scaffold, pnpm workspace, root composer, lint/format/static analysis configs, CI skeleton, `packages/protocol` with spec drafts for negotiation/page/json/errors/headers, JSON Schemas and first fixtures, README/LICENSE/SECURITY/CONTRIBUTING/CHANGELOG, changesets.

### Phase 1 — Laravel core: HTML, Page, JSON (2–3 weeks)

`ContentNegotiator` and tests; `HandleBridgeRequests`; `Page`, `PropBag`, `PropResolver`, `Serializer` (plain, closures, JsonResource, ResourceCollection+paginator, paginators, Arrayable, JsonSerializable, `lazy`, `defer`, `always`); `PageResponse`, `RedirectBuilder`; Html/Page/Json representers; default shell view with embedded page; `ErrorMapper`/`ExceptionRenderer` for all listed exceptions; caching headers + ETag; build version 409; shared props; `VerifyCsrfToken` variant; testing macros; `bridge:install`; conformance tests; playground Laravel side (Customers CRUD, resources, seeds) verified with curl in all three non-stream modes.

### Phase 2 — TypeScript core and Vue adapter (3 weeks)

`packages/core`: request manager, response parser, router with history/scroll, page store, forms (incl. uploads with progress), page cache/prefetch, emitter. `packages/vue`: `createBridgeApp`, composables, `BridgeLink`, `Deferred`. Playground UI: Dashboard, Customers pages, Json demo page, Auth, Errors. Playwright specs for navigation, forms, validation, upload, partial reload, deferred, JSON demo, auth, errors.

### Phase 3 — SSE (2–3 weeks)

`EventBus` contract, `sync`/`redis`/`database` drivers, `Publisher`, `ChannelAuthorizer`, `StreamResponse`/`StreamWriter`, `ShouldStream` listener, `ConnectionLimiter`, stream ticket route, `bridge:doctor`, `bridge:stream:prune`. Core `StreamClient` with both transports, parser, backoff, watchdog, control dispatch. `useStream`. Playground `Realtime` page and `CustomerCreated` event. Real-HTTP integration tests and two-context Playwright spec. Deployment docs for FPM/Nginx/FrankenPHP/Octane/Caddy.

### Phase 4 — Hardening and polish (2 weeks)

`Merge` props, `jsonRoot`, Precognition support in forms, `BridgeHead`, `useRemember`, public caching guard rails, rate limiters, security review against §23, benchmark suite and first `RESULTS.md`, full docs site, `bridge:doctor` proxy checks, accessibility pass on playground.

### Phase 5 — 1.0 and extensions (ongoing)

SSR gateway and `@swarakaka/bridge-vue/server`; adapter guide; React adapter skeleton in a separate repo or package; mobile SDK guide with fixtures; relay server design doc. Tag 1.0 when Definition of Done holds.

---

## 38. Definition of Done

- All three modes (plus HTML shell) served from the playground's Customers controller with no mode-specific code in controllers.
- Every negotiation rule in §5 and every header in Appendix B has a test.
- Conformance suite passes on both PHP and TS against shared fixtures.
- Every exception in §7.2 has a test in every mode.
- SSE: real-HTTP integration tests pass with `database` and `redis` drivers; Playwright two-context realtime test passes under PHP-FPM and FrankenPHP; `max_duration` recycling and `Last-Event-ID` replay verified.
- Coverage: ≥ 90 % lines in `packages/laravel` and `packages/core`; ≥ 80 % in `packages/vue`.
- PHPStan level 8, TypeScript strict, zero lint errors.
- `benchmarks/RESULTS.md` populated by the CI benchmark workflow; docs cite it.
- Docs cover every section in §32; protocol spec is normative and versioned `1`.
- `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md` present; `bridge:install` sets up a fresh Laravel app in under five minutes (documented walkthrough tested in CI).

---

## 39. Recommended V1 scope

**In:** negotiation; HTML shell (embedded and static); Page mode with shared/lazy/deferred/always props, partial reloads, build versioning, redirects, errors; JSON mode with Laravel-native shapes, `Location` semantics, inline deferred; SSE with `invalidate`/`prop`/`notification`/`navigate`/`progress`/`error`/`end`, sync/redis/database buses, channel authorization, tickets, limits; Vue adapter with router, forms, uploads, prefetch, stream; playground; conformance, unit, feature, integration, E2E tests; benchmarks; docs.

**Out (post-1.0):** SSR, React adapter, mobile SDKs, relay server, Reverb/Echo transport, `Merge` props beyond basic append, GraphQL-like field selection, offline support.

---

## 40. Recommended first milestone

**Milestone 1 = end of Phase 1: "one controller, three representations, verified with curl".**

Acceptance:

```bash
curl -s -H 'Accept: text/html' http://localhost:8000/customers | grep bridge-page
curl -s -H 'Accept: application/vnd.bridge+json; v=1' http://localhost:8000/customers | jq .component
curl -s -H 'Accept: application/json' http://localhost:8000/customers | jq .data.customers.meta.total
curl -s -H 'Accept: application/json' -X POST -d 'name=' http://localhost:8000/customers   # → 422 {message, errors}
curl -s -H 'Accept: application/vnd.bridge+json; v=1' -H 'X-Bridge-Only: customers' -H 'X-Bridge-Component: Customers/Index' http://localhost:8000/customers
curl -s -H 'Accept: application/vnd.bridge+json; v=1' -H 'X-Bridge-Build: stale' -i http://localhost:8000/customers | grep -E '409|X-Bridge-Location'
curl -s -H 'Accept: text/event-stream' -i http://localhost:8000/customers | grep 406
```

plus green Pest, PHPStan, and conformance suites. This milestone proves the protocol and the representation layer before any client code exists, which is the cheapest point to change the design.

---

## Implementation notes and deviations

Recorded as phases ship. Each entry names the section it refines.

### Phase 5 (2026-09-22)

- **§26 SSR.** `HttpSsrGateway` POSTs the page object to `@swarakaka/bridge-vue/server` (`createSsrRenderer` + `createSsrServer`, node:http only). The shell's `@bridge` marks the root `data-server-rendered` and `@bridgeHead` appends head fragments (`BridgeHead` records title/meta into a head context on the server). The client hydrates with `createSSRApp` and marks `data-bridge-hydrated`. Failures fall back to client rendering. The E2E suite runs entirely under SSR.
- **Packaging.** ESM output now uses explicit `.js` specifiers (`NodeNext`); previously Node could not import `dist/`, which no bundler-based consumer had noticed.
- **§33 React.** `packages/react` is an experimental skeleton proving adapter independence; not part of the 1.0 surface.
- **§34 mobile.** Guide written (`docs/beyond/mobile-clients.md`); fixtures are the offline test data.
- **§20.4 relay.** Design recorded in `development/relay-design.md`; not implemented.
- **§38 DoD.** `development/release-readiness.md` tracks each criterion; FrankenPHP in CI and the Inertia baseline remain open and are excluded from 1.0.

### Phase 4 (2026-09-22)

- **§12 / §17 merge props.** `Bridge::merge()` lists keys in `meta.merge`; the client appends them only for visits that opt in (`merge: true`, e.g. "load more"). Invalidation reloads and searches replace, otherwise a stream invalidation of a merge prop would duplicate rows. Spec `page.md` §3 updated.
- **§7.1 `jsonRoot`** implemented as planned (root prop becomes `data`, the rest moves to `meta`; `meta.merge` is stripped from JSON mode).
- **§15 Precognition.** `Form.validate()` sends `Precognition`/`Precognition-Validate-Only`; a `204` is an `empty` response that the router reports as success without applying anything.
- **§23 security.** Review recorded in `development/security-review.md`; added the `throttle:bridge-stream` limiter (`bridge.stream.connects_per_minute`) and caps on `?channels=` (count and length).
- **§25 benchmarks.** Harness in `benchmarks/` with a fetch-based load generator (autocannon could not parse the dev server's responses), an SSE delivery scenario and an in-process serialization micro-benchmark. First results recorded for the database and Redis buses. Lessons: PHP's built-in server must be started directly from `public/` and killed as a process group (workers survive the parent and keep the port); idle keep-alive sockets pin its workers; SQLite needs WAL under polling; publish only after `ready`. The Inertia baseline app is still not built, so no comparative claim is made.
- **§32 docs.** VitePress site under `docs/` (`pnpm docs:dev`), with the deployment guide mirrored into the guide.
- **§20.2 Redis driver** now has a real-Redis test (`BRIDGE_TEST_REDIS=1`), run in CI against the Redis service.
- **§27 accessibility.** Skip link, labelled navigation with `aria-current`, `main` landmark, live regions for toasts and notifications, progress bar role.

### Phase 3 (2026-09-22)

- **§8.3 / §20.3 replay and `end`.** An `end` control message replayed from the bus after `Last-Event-ID` is ignored; only `end` signals published while the connection is live close it. Otherwise a fresh connection replaying history would close on an old shutdown signal.
- **§20.5 resync rule.** The client resyncs (`invalidate: "*"`) only when the previous connection did not end orderly and the server could not replay. After an orderly `end{reconnect:true}` nothing was missed, so no reload is issued. Immediate reconnects are also gated on a healthy previous connection (≥ 1 s, no error) to avoid a tight loop when the server throttles.
- **§20.3 abort handling.** The stream loop runs with `ignore_user_abort(true)` and checks `connection_aborted()` after each flush; with the default PHP would terminate the script on a failed write and skip `finally`, leaking the per-user connection count. A shutdown function releases the counter as a backstop.
- **§21.2 tickets.** `Bridge::streamTicket()` builds a temporary signed route with `bridge_user`; `AuthenticateStreamTicket` authenticates it with `onceUsingId` and is inserted before `AuthenticatesRequests` in the kernel's priority list so it runs ahead of `auth:*`.
- **§20.2 bus cursor.** One cursor spans channels: per-channel positions when known, else a fallback id. Redis Streams ids are time-based, so `Last-Event-ID` from one channel applies to all; the database and sync drivers have a global order. Messages published to several channels carry a uuid and are deduplicated per connection.
- **§20.2 Redis driver** uses raw commands (`XADD`, `XREAD BLOCK`, `TIME`) so it works with phpredis and predis alike; it is not exercised in CI yet (Phase 4 adds a Redis service run).
- **§17 / §8.4 `ShouldStream::toStream()`** may return several messages (an application event plus an invalidation is the common case).
- **§27 playground.** The layout opens one stream per signed-in user and provides it; pages subscribe through `useAppStream()`. Under `php artisan serve` the suite needs `PHP_CLI_SERVER_WORKERS` with `--no-reload`, and because that mode forwards the parent's environment, the E2E config passes its variables explicitly rather than relying on `.env.e2e`.
- **Deployment guide** lives in `docs/realtime/deployment.md` until the VitePress site (Phase 4).

### Phase 2 (2026-09-22)

- **§10 core.** `Router` gained a `prepare(page)` hook (config `prepare`) that adapters use to load the page component before the swap; without it the first render after navigation was empty. The store keeps a non-validation `error` state that adapters render in place (`resolveError`); an `error` listener returning `false` suppresses it, and `hardReloadOnError` forces a document load instead.
- **§10.3 Vue.** Page props are passed to the page component only; layouts receive nothing (they use `usePage()`), because spreading props onto a layout leaked them as DOM attributes. `useForm` exposes `form.data.*` rather than flattened fields to avoid name collisions with form methods.
- **§14 forms.** `form.cancel()` cancels through the router so the visit is marked cancelled (aborting the controller alone let a mocked response resolve as success).
- **§18 prefetch.** Playwright cannot observe multipart bodies, so the upload E2E asserts the spoofed `PUT` through its effect (avatar visible after the redirect) rather than the `_method` field.
- **§21 playground auth.** Customers routes sit under `auth:sanctum` inside the `web` group so sessions and bearer tokens share the same URLs; Sanctum 4 requires its migration to be published. `redirectGuestsTo('/login')` supplies the `redirect` hint for `unauthenticated` errors.
- **§27 playground.** E2E runs under `APP_ENV=e2e` with a generated `playground/.env.e2e` (debug off, own SQLite file), because environment variables passed to `php artisan serve` did not reliably override `.env`.
- **Protocol types.** The generator strips `if`/`then` conditionals (TypeScript cannot express "errors required when kind is validation") and declares cross-schema types once (`BridgeErrorKind` is imported by `stream-control`).

### Phase 1 (2026-09-22)

- **§5 negotiation, wildcard-only requests.** When every acceptable mode matched only through `*/*` and the configured default mode is excluded with `q=0`, the negotiator falls back to `json`, then `page`, `html`, `stream`. Rank order alone would have picked `stream`, which is useless to a generic client. Spec updated (`negotiation.md` §2).
- **§9.2 middleware registration.** `HandleBridgeRequests` is appended to the `web` group through the HTTP kernel (`callAfterResolving(Kernel::class)` + `appendMiddlewareToGroup`) rather than `Router::pushMiddlewareToGroup`, because the kernel re-syncs its groups to the router when constructed and would drop the router-level push. Config `bridge.middleware.auto_register` disables it.
- **§9.2 CSRF variant on Laravel 13.** Laravel 13 ships `PreventRequestForgery` (origin-based) in the `web` group. `Bridge\Http\Middleware\VerifyCsrfToken` still extends the token-based `VerifyCsrfToken`, which exists on 11–13; swap it with `replaceInGroup('web', …)`. Revisit in Phase 4 whether to extend `PreventRequestForgery` when present.
- **§6.5 / Appendix C flash.** `Bridge::redirect()->flash($message, $level)` writes the configured `bridge.flash.keys` (default `message`, `level`) to the session; the `flash` shared prop reads the same keys and is `null` when none are set. JSON mode echoes them under `meta.flash`.
- **§7.1 `jsonRoot`, §12 `Merge` props** were deferred to Phase 4 as planned; `Merge` is not yet in the package.
- **§29.2 fixtures.** Paginated resource fixtures now carry Laravel's real `meta.links` array and correct `from`/`to`; `page/partial.json` contains only requested props (no `auth`), matching spec/page.md §3; the validation fixture message is Laravel's real `"The email field is required. (and 1 more error)"`.
- **Errors.** `abort(403)` without a message maps to `"This action is unauthorized."` so raw and policy-originated 403s read the same. `AuthenticationException::redirectTo()` throwing `RouteNotFoundException` (no `login` route) falls back to `bridge.auth.login_url`.
- **Testing helpers.** `assertBridgePage()` accepts both page responses and HTML shells with an embedded page object.
- **Playground.** Runs on Laravel 13; `BRIDGE_BUILD_VERSION=dev` is set in `.env.example` so the 409 build-conflict check is demonstrable before a Vite build exists. `APP_DEBUG=true` makes 404 messages include the model name, which is Laravel's debug behaviour; the feature test asserts with debug off.

---

## Appendix A — Answers to the 20 architectural questions

1. **Is the HTML shell + second Bridge request worth it?** Not as the default. Bridge embeds the initial page object in the shell (hybrid), saving one round trip on first load. The static-shell mode exists for CDN/PWA/Capacitor deployments where a data-free document is worth the extra request.
2. **Can HTTP caching mitigate the extra request?** Only partially. The static shell itself caches well, but the bootstrap Page request is private data: an `ETag` yields a 304 that saves bytes, not the round trip. Hence embedding by default.
3. **Hybrid mode with optional embedded props?** Yes, and it is the default (`bridge.shell.embed = true`). Per-route `->embed(false)` is available.
4. **Should JSON mode use Laravel API Resources?** Yes. Props may be `JsonResource`/`ResourceCollection`; Bridge serializes them exactly as Laravel would, including paginated `{data, links, meta}`.
5. **Should Bridge define its own resource abstraction?** No. `Page` + `PropBag` is the only Bridge representation concept; values are Laravel-native. `Lazy`/`Deferred`/`Always`/`Merge` are delivery hints, not resources.
6. **SSE: update props directly or invalidate?** Invalidate-first. Re-fetch goes through auth/policies/resources, needs no data on the bus, coalesces naturally, and never applies stale data. `prop` push is allowed for small, per-user, non-sensitive values (counters, presence, progress).
7. **How should SSE reconnect?** Exponential backoff with jitter (1 s → 30 s), honoring `retry:`; `Last-Event-ID` replay when the bus supports it, otherwise a resync partial reload; heartbeat watchdog; immediate reconnect on `end{reconnect:true}`, on tab visibility, and on `online`.
8. **How should SSE authenticate?** Through the route's normal guard. The default fetch transport sends cookies or `Authorization`. Native `EventSource` gets cookies, or a 60 s single-purpose signed ticket URL when a header-less client must use bearer auth. Long-lived tokens never go in URLs.
9. **How should SSE work with PHP-FPM?** It works but each stream holds a worker. Bridge bounds streams to `max_duration` (60 s default), heartbeats, uses blocking bus reads, releases on client abort, caps concurrent streams per user, and ships `bridge:doctor`. Docs give pool-sizing guidance and recommend a dedicated FPM pool or FrankenPHP/Octane for larger deployments; the protocol permits a future external relay.
10. **Should Laravel Reverb be supported?** Not as a bus backend (it is a WebSocket server, not a message store). A future optional client transport over Echo/Reverb delivering the same `bridge` control envelope is compatible with the protocol and listed for post-1.0.
11. **Should Redis be required?** No. `database` and `sync` drivers ship in core; Redis Streams is the recommended production driver.
12. **How are multi-user events isolated?** Channels are computed server-side per connection (`user.{id}`), client-requested channels pass through `Bridge::channel()` authorizers, authorization is re-checked on every reconnect and replay, and `invalidate` carries no data.
13. **How are tenant-specific events isolated?** `tenant.{id}` channels with authorizers, bus key prefixing per app, and the documented rule that data-carrying events go only to channels whose every subscriber may see the data.
14. **SSE in core or separate package?** Core. The negotiator, error mapping, and protocol version must move together; drivers are small and optional at runtime.
15. **How should protocol versioning work?** Media type parameter (`application/vnd.bridge+json; v=1`) on request and response; `protocol` field in bodies and in the `ready` stream event; additive changes never bump; unsupported version → 406 and the client hard-reloads. JSON mode is the app's API and is versioned by the app.
16. **How should mobile clients authenticate?** With whatever Laravel guard the route uses, typically Sanctum bearer tokens via `auth:sanctum`, sending `Accept: application/json`. Bridge's CSRF middleware variant lets the same `web` routes accept bearer requests safely.
17. **How does the same controller return page vs JSON?** `Bridge::render()` returns a `Responsable` `PageResponse`; at `toResponse()` time it asks the `RepresenterRegistry` for the negotiated mode's `Representer`. Controllers never branch.
18. **How are errors represented consistently?** One `ErrorMapper` produces an `ErrorEnvelope` from any exception; each `Representer` renders it: Laravel default for HTML, Bridge error object for Page, Laravel-native JSON for JSON, `bridge` `error` event for streams.
19. **How does caching differ between authenticated browser and mobile requests?** Server headers are identical (`private, no-cache` + `ETag`). Browsers add the client-side `PageCache` (short TTL, cleared on mutations/logout); mobile clients use `If-None-Match`. `public` caching is opt-in and refused for authenticated responses unless forced.
20. **How does Bridge behave when JavaScript is disabled?** The shell renders `<noscript>` content and nothing else; classic HTML form posts still work with Laravel's redirect-back validation because HTML mode is untouched. Content-critical pages should use SSR (Phase 5). Bridge is not a progressive-enhancement framework and the docs say so.

---

## Appendix B — Header and media-type reference

### Media types

| Type                               | Meaning                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `application/vnd.bridge+json; v=1` | Bridge Page mode (page, error objects). `v` is the protocol version; default 1. |
| `application/json`                 | JSON mode.                                                                      |
| `text/event-stream`                | Stream mode.                                                                    |
| `text/html`                        | HTML shell.                                                                     |

Rejected: `application/vnd.bridge.page+json` / `.event+json` (unnecessary splitting; the body's `type` field distinguishes), `application/vnd.bridge.v1+json` (see §36).

### Request headers

| Header                                    | Standard?     | Purpose                                                                                  | Vary?                     |
| ----------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| `Accept`                                  | yes           | Mode selection.                                                                          | yes                       |
| `Authorization`, `Cookie`, `X-XSRF-TOKEN` | yes / Laravel | Authentication, CSRF. Not Bridge-specific.                                               | implied by `private`      |
| `Last-Event-ID`                           | yes (SSE)     | Replay cursor.                                                                           | n/a                       |
| `Purpose: prefetch`                       | de facto      | Marks prefetch requests. Optional.                                                       | no                        |
| `X-Bridge-Build`                          | custom        | Client asset build id; GET mismatch → 409. No standard header expresses bundle identity. | no (compared, not cached) |
| `X-Bridge-Only`                           | custom        | Comma-separated prop keys to include (partial reload).                                   | yes                       |
| `X-Bridge-Except`                         | custom        | Comma-separated prop keys to exclude.                                                    | yes                       |
| `X-Bridge-Component`                      | custom        | Component the client currently shows; guards partial merges.                             | yes                       |

### Response headers

| Header                                   | Purpose                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Content-Type`                           | Carries the negotiated media type and `v`.                                                      |
| `Vary`                                   | `Accept, X-Bridge-Only, X-Bridge-Except, X-Bridge-Component` on Page/JSON.                      |
| `Cache-Control`, `ETag`, `Last-Modified` | §24.                                                                                            |
| `Location`                               | Redirects (303 Page, 302 HTML, 200/201 JSON).                                                   |
| `X-Bridge-Location`                      | Custom. With 409: the URL for a full-document navigation (build mismatch or external redirect). |
| `Retry-After`                            | With 429.                                                                                       |
| `X-Accel-Buffering: no`                  | Streams; disables Nginx buffering.                                                              |

---

## Appendix C — Configuration reference (`config/bridge.php`)

```php
return [
    'protocol' => ['max_version' => 1],
    'shell' => ['view' => 'app', 'embed' => true, 'root_id' => 'app'],
    'build' => ['version' => null],                    // null → hash of public/build/manifest.json
    'negotiation' => ['default_mode' => 'html'],       // for */* requests; overridable per route
    'json' => ['resolve_deferred' => true],
    'auth' => ['login_url' => '/login'],
    'flash' => ['keys' => ['message', 'level']],
    'cache' => ['etag' => true],
    'csrf' => ['skip_for_bearer' => true],             // only when the Bridge CSRF middleware is used
    'stream' => [
        'driver' => env('BRIDGE_STREAM_DRIVER', 'database'),
        'prefix' => env('BRIDGE_STREAM_PREFIX', env('APP_NAME', 'bridge')),
        'heartbeat_ms' => 15000,
        'max_duration_s' => env('BRIDGE_STREAM_MAX_DURATION', null), // null → 60 on FPM, 300 on Octane
        'retry_ms' => 3000,
        'max_connections_per_user' => 3,
        'ticket_ttl_s' => 60,
        'drivers' => [
            'sync' => [],
            'redis' => ['connection' => 'default', 'maxlen' => 1000],
            'database' => ['connection' => null, 'table' => 'bridge_stream_events', 'poll_ms' => 1000, 'retain_minutes' => 60],
        ],
    ],
    'ssr' => ['enabled' => false, 'url' => 'http://127.0.0.1:13714'],
];
```
