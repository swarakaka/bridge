بەڵێ، ئەمە دوو خاڵی زۆر گرنگن و بەڕاستی Bridge ـەکە دەکەنە شتێکی گشتی‌تر لە Inertia. بە تایبەتی **JSON mode** دەبێت لە بنەمای protocol ـەکەدا بێت، نەک feature ـێکی دواتر.

من prompt ـەکەی پێشوو بەمانە زیاد دەکەم، بەڵام باشترە ئەم بەشە بە شێوەی ڕوون وەک requirement ـی سەرەکی بخرێتە ناوی prompt ـەکە:

You are a senior software architect and Laravel/Vue framework engineer.

I want you to create a **complete, implementation-ready technical plan** for building a new open-source framework/package called **Bridge**.

The project will be hosted on GitHub under:

`github.com/swarakaka/Bridge`

Do NOT implement the project yet.

Your task is to deeply analyze the requirements below and produce a detailed implementation plan that another developer (or Claude Code in a later step) can follow to build the project from start to finish.

---

# 1. Project Goal

Bridge is a server-driven application bridge for Laravel applications with a Vue 3 frontend.

It is inspired by the developer experience of Inertia, but it must NOT simply copy Inertia's internal architecture.

Bridge has three primary responsibilities:

1.  Server-driven frontend page rendering

2.  JSON/API responses from the same Laravel routes/controllers

3.  Real-time/event communication through SSE

The long-term goal is to avoid maintaining separate implementations for:

```text
Web frontend
Mobile API
Real-time API
```

Instead, Bridge should provide a unified communication layer:

```text
                         Laravel
                            │
                         Bridge
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
      Vue 3 SPA          JSON Client          SSE
          │                 │                 │
          ▼                 ▼                 ▼
       Browser          Mobile App        Live UI
```

The architecture must remain extensible so React, Svelte, mobile applications, and other clients can consume the same backend capabilities.

---

# 2. Core Architectural Principle

Bridge MUST NOT be designed as:

```text
Laravel → Vue
```

It must be designed as:

```text
Laravel
   ↓
Bridge Protocol
   ↓
Client
```

where Client can be:

```text
Vue
React
Mobile App
CLI
Another service
```

The Laravel package should not contain Vue-specific assumptions.

---

# 3. Three Communication Modes

Bridge MUST support three explicit modes.

## Mode A — Page / SPA mode

Used by Vue.

Example:

```http
GET /customers
Accept: text/html
```

Initial request returns the minimal application shell.

Then the Bridge frontend requests:

```http
GET /customers
X-Bridge: true
Accept: application/vnd.bridge+json
```

Laravel returns:

```json
{
  "type": "page",
  "version": "1",
  "component": "Customers/Index",
  "url": "/customers",
  "props": {
    "customers": {}
  }
}
```

---

# 4. JSON Mode — Critical Requirement

Bridge MUST support a native JSON mode.

If the client requests JSON:

```http
GET /customers
Accept: application/json
```

or an equivalent explicit Bridge JSON request:

```http
GET /customers
X-Bridge: json
Accept: application/json
```

the server MUST return JSON only.

It MUST NOT return:

```html
<html>
  ...
</html>
```

It MUST NOT return a Vue page.

It MUST NOT require a separate API controller.

The same Laravel controller should be able to serve:

```text
Browser
Mobile App
External Client
JavaScript Client
```

from the same route and business logic.

Example:

```php
public function index()
{
    return Bridge::render('Customers/Index', [
        'customers' => Customer::paginate(20),
    ]);
}
```

For a Bridge page request:

```http
Accept: application/vnd.bridge+json
```

response:

```json
{
  "type": "page",
  "component": "Customers/Index",
  "props": {
    "customers": {}
  }
}
```

For a normal JSON request:

```http
Accept: application/json
```

response should be:

```json
{
  "data": {
    "customers": {}
  }
}
```

The exact JSON response format must be designed carefully.

---

# 5. JSON Mode Must Not Be a Hack

Do NOT implement JSON support as:

```php
if (request()->expectsJson()) {
    ...
}
```

inside every controller.

The Bridge architecture should provide centralized content negotiation.

For example:

```text
Request
   │
   ▼
Bridge Content Negotiator
   │
   ├── HTML
   ├── Bridge Page
   ├── JSON
   └── SSE
```

Determine the best architecture for this.

It should be possible for an existing Laravel controller to return a Bridge response and let Bridge decide how to represent it.

---

# 6. Content Negotiation

Design a formal content negotiation system.

Potential modes:

```text
text/html
application/vnd.bridge+json
application/json
text/event-stream
```

The final implementation should follow HTTP standards and use `Accept` headers appropriately.

Do NOT rely only on custom headers if standard HTTP content negotiation can express the intent.

However, custom headers may be used where necessary.

Define exact precedence rules.

For example:

```text
Accept: text/event-stream
        ↓
SSE

Accept: application/json
        ↓
JSON

X-Bridge: true + application/vnd.bridge+json
        ↓
Bridge Page

Accept: text/html
        ↓
HTML shell
```

Do not assume this exact priority is correct. Analyze and define the proper negotiation rules.

---

# 7. One Controller, Multiple Representations

The architecture should allow:

```php
public function index()
{
    return Bridge::render('Customers/Index', [
        'customers' => Customer::paginate(20),
    ]);
}
```

to be consumed as:

### Vue

```text
Bridge Page Response
```

### Mobile

```text
JSON
```

### SSE

```text
event stream
```

without duplicating business logic.

The plan must explain exactly how the representation layer works.

---

# 8. JSON Response Design

Design a consistent JSON response contract.

For collection:

```json
{
  "data": [],
  "meta": {},
  "links": {}
}
```

For single resource:

```json
{
  "data": {}
}
```

For errors:

```json
{
  "message": "Validation failed.",
  "errors": {
    "email": ["The email field is required."]
  }
}
```

But do not blindly adopt these examples.

Analyze whether Bridge should use:

- Laravel's native JSON resource behavior

- a Bridge JSON envelope

- JSON:API

- a custom minimal format

- configurable serializers

The goal is **not** to reinvent an API specification unnecessarily.

The JSON mode should feel natural for Laravel developers.

---

# 9. Mobile Application Requirement

A major requirement is that developers should NOT need to create:

```text
CustomerController
ApiCustomerController
MobileCustomerController
```

just because a mobile app needs the same data.

The same backend route and application logic should be consumable by:

```text
Vue
React
Flutter
React Native
Swift
Kotlin
```

through JSON.

Analyze authentication implications:

- session authentication

- Sanctum

- bearer tokens

- API tokens

- OAuth

- CSRF

- mobile authentication

Do not assume browser session authentication is sufficient for mobile applications.

The Bridge architecture should allow Laravel authentication mechanisms to remain independent from the representation mode.

---

# 10. SSE — Critical Requirement

Bridge MUST support **Server-Sent Events (SSE)** as a first-class communication mode.

The architecture should support:

```http
GET /customers/events
Accept: text/event-stream
```

or another clean Bridge-specific SSE mechanism.

The goal is to allow Laravel to stream events/data to the frontend without introducing a completely separate real-time architecture.

---

# 11. SSE Protocol

Design a formal SSE event protocol.

For example:

```text
event: bridge
data: {"type":"prop","key":"notifications","value":[]}

event: bridge
data: {"type":"invalidate","key":"customers"}

event: bridge
data: {"type":"navigate","url":"/messages"}

event: bridge
data: {"type":"toast","level":"success","message":"Saved"}
```

But do NOT assume these event types are final.

Design the proper event model.

Potential event types may include:

```text
prop
patch
invalidate
refresh
navigate
notification
progress
error
heartbeat
```

Determine which are actually necessary.

---

# 12. SSE + Vue

The Vue adapter should eventually support something like:

```ts
const stream = bridge.sse('/events')

stream.on('notification', event => {
    ...
})
```

or:

```ts
useBridgeStream('/events')
```

The exact API must be designed.

It should support:

- automatic connection

- reconnect

- exponential backoff

- Last-Event-ID

- authentication

- heartbeat

- connection state

- error handling

- cleanup when component unmounts

---

# 13. SSE + Page Props

Investigate whether SSE should be able to update existing page props.

Example:

Initial page:

```json
{
  "component": "Dashboard",
  "props": {
    "notifications": []
  }
}
```

Then SSE:

```text
event: bridge
data: {
    "type": "prop",
    "key": "notifications",
    "value": [...]
}
```

Vue automatically updates:

```ts
page.props.notifications
```

Analyze whether this is a good abstraction.

Also investigate a more scalable model:

```text
invalidate resource
```

instead of sending the entire data set.

For example:

```json
{
  "type": "invalidate",
  "resource": "customers"
}
```

which causes the Vue client to perform:

```text
Bridge partial reload
```

Determine which approach is preferable and why.

---

# 14. SSE and Laravel

Design the Laravel API.

Potential example:

```php
return Bridge::stream(function ($stream) {
    $stream->event('notification', [
        'message' => 'New customer created',
    ]);
});
```

or:

```php
return Bridge::sse('/events', function () {
    ...
});
```

Do NOT assume these APIs are final.

Determine the cleanest Laravel developer experience.

---

# 15. SSE Authentication

Analyze how authenticated SSE should work.

Consider:

```text
Cookie/session
Bearer token
Sanctum
Signed URL
```

Important:

Do not put sensitive bearer tokens into query parameters unless there is a strong justification.

Explain browser limitations around custom headers for native `EventSource`.

Determine whether Bridge should support:

```text
fetch-based SSE client
```

in addition to native `EventSource`.

---

# 16. SSE Infrastructure

Analyze Laravel deployment implications.

SSE requires long-lived HTTP connections.

Investigate compatibility with:

```text
PHP-FPM
Nginx
Apache
Caddy
Laravel Octane
FrankenPHP
RoadRunner
queue workers
Redis
```

Do not assume that PHP-FPM is ideal for long-running SSE connections.

Explain the recommended production architecture.

For example:

```text
Laravel
   │
   ├── normal HTTP
   │
   └── SSE
          │
          ▼
      Redis / PubSub
```

Determine whether Bridge should provide an abstraction over the event source.

---

# 17. SSE Event Bus

Consider creating a Bridge event abstraction:

```php
Bridge::broadcast(...)
```

or:

```php
Bridge::event(...)
```

which could later be backed by:

```text
in-memory
Redis
Laravel Reverb
Redis Pub/Sub
database
queue
```

Do not tightly couple the Bridge core to Redis.

Define an interface such as:

```text
EventBus
Stream
Publisher
Subscriber
```

if justified.

---

# 18. JSON + SSE + Page as One Protocol

A key design goal is that all three modes share the same domain representation.

Conceptually:

```text
                    Bridge Domain Data
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
          Page JSON      JSON API       SSE
             │             │             │
             ▼             ▼             ▼
            Vue          Mobile       Real-time
```

The same resource/data model should be serializable through different transports.

The protocol should separate:

```text
WHAT the data means
```

from:

```text
HOW the data is transported
```

This separation is one of the most important architectural requirements.

---

# 19. Unified Resource / Representation Layer

Investigate whether Bridge should introduce a resource abstraction.

For example:

```php
Bridge::resource(Customer::class, $customer)
```

or simply rely on:

```text
Laravel API Resources
```

Prefer Laravel-native abstractions if they are sufficient.

Do not duplicate functionality unnecessarily.

The final plan must explicitly decide:

```text
Bridge Resource Layer
vs
Laravel JsonResource
vs
both
```

---

# 20. Protocol Layers

The architecture should ideally separate:

```text
Domain/Application
        ↓
Representation
        ↓
Transport
```

For example:

```text
Laravel Controller
        ↓
Bridge Page / Resource
        ↓
Representation
        ↓
Transport
   ┌────┼─────┐
   │    │     │
 HTTP  JSON   SSE
```

Define these boundaries precisely.

---

# 21. Error Handling Across Modes

The same Laravel exception should be representable differently.

Example:

```text
ValidationException
```

HTML:

```text
Laravel/Bridge form response
```

Bridge Page:

```json
{
  "type": "validation_error",
  "errors": {}
}
```

JSON:

```json
{
  "message": "Validation failed.",
  "errors": {}
}
```

SSE:

```text
event: error
data: {...}
```

Design this centrally.

Do NOT duplicate exception handling inside every controller.

---

# 22. Playground Requirements

The playground MUST demonstrate all three communication modes.

Create:

```text
playground/
```

with a Laravel application and Vue frontend.

The playground should contain:

## Pages

```text
Dashboard
Customers
Customers List
Customers Create
Customers Edit
Customers Show
```

## JSON demonstration

A page should show that the same endpoint can be requested with:

```http
Accept: application/json
```

and returns JSON.

Provide a small demo client or documentation page inside the playground.

## SSE demonstration

Create an SSE page:

```text
Realtime
```

that demonstrates:

- connection status

- live events

- notifications

- prop updates

- invalidation

- reconnect

- heartbeat

For example:

```text
Create customer in browser A
        ↓
Laravel event
        ↓
Bridge SSE
        ↓
Browser B
        ↓
Customer list updates
```

This should be an actual working playground feature.

---

# 23. Playground as Integration Test Environment

The playground is not merely a demo.

It should also serve as an integration test environment.

It must make it easy to manually verify:

```text
HTML
Bridge Page
JSON
SSE
Forms
Validation
Navigation
Partial Reload
Deferred Props
File Upload
Authentication
Authorization
```

---

# 24. Protocol Headers

Define exact request/response headers.

Potential examples:

```text
Accept
Content-Type
X-Bridge
X-Bridge-Version
X-Bridge-Only
X-Bridge-Except
X-Bridge-Request
Last-Event-ID
```

Do not add headers unnecessarily.

Prefer standard HTTP headers where possible.

Document every custom header.

---

# 25. Protocol Content Types

Evaluate whether Bridge should use:

```text
application/vnd.bridge+json
application/vnd.bridge.page+json
application/vnd.bridge.event+json
text/event-stream
application/json
```

Choose a clean media-type strategy.

Consider versioning:

```text
application/vnd.bridge.v1+json
```

versus protocol version fields.

Explain the decision.

---

# 26. Caching

Caching behavior must differ by mode.

Analyze:

### HTML

```text
Cache-Control
ETag
```

### Bridge Page JSON

```text
ETag
Last-Modified
private/public
```

### Normal JSON

Potential API caching.

### SSE

Normally:

```text
Cache-Control: no-cache
Connection: keep-alive
```

Design correct defaults.

Be extremely careful with authenticated data.

---

# 27. Performance

Benchmark all three modes.

At minimum compare:

```text
Traditional Inertia-style page
Bridge Page
Bridge JSON
Bridge SSE
```

Measure:

```text
HTML size
JSON size
TTFB
FCP
LCP
navigation latency
CPU
memory
serialization cost
JSON parsing cost
number of requests
```

Do not claim Bridge is faster without benchmarks.

The plan should define reproducible benchmarks.

---

# 28. Repository Architecture

Propose a monorepo.

Potential structure:

```text
Bridge/
├── packages/
│   ├── laravel/
│   ├── vue/
│   └── protocol/
│
├── playground/
│
├── tests/
│
├── docs/
│
├── benchmarks/
│
├── .github/
│   └── workflows/
│
├── composer.json
├── package.json
├── pnpm-workspace.yaml
├── README.md
├── LICENSE
├── SECURITY.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

Evaluate and improve this structure.

---

# 29. Laravel Package Architecture

Plan classes for:

```text
Bridge
BridgeManager
BridgeResponse
BridgePageResponse
BridgeJsonResponse
BridgeRedirectResponse
BridgeSseResponse

ContentNegotiator
RepresentationResolver
PropResolver
Serializer

SseStream
SseEvent
EventBus
EventPublisher

Middleware
Controllers
Contracts
```

Do not blindly use these names.

Provide the final class architecture and explain responsibilities.

---

# 30. Vue Package Architecture

Plan:

```text
createBridgeApp
BridgeClient
BridgeRouter
PageStore
RequestManager
Cache
Form
SseClient
usePage
useProp
useForm
useBridgeStream
BridgeLink
```

Again, improve naming where appropriate.

---

# 31. Testing

Testing MUST cover all modes.

Laravel:

```text
HTML negotiation
Bridge page negotiation
JSON negotiation
SSE negotiation
props
serialization
redirects
validation
errors
shared props
lazy props
deferred props
partial reloads
SSE events
authentication
authorization
security
```

Vue:

```text
router
page store
props
forms
JSON protocol
SSE client
reconnect
event handling
cache
navigation
```

E2E:

```text
Playwright
```

Include actual SSE integration tests.

---

# 32. Security

Pay special attention to:

```text
SSE authentication
JSON API authentication
CSRF
CORS
open redirects
cache poisoning
private data caching
event leakage
tenant isolation
authorization
replay
connection exhaustion
rate limiting
```

If SSE connections are long-lived, analyze denial-of-service implications.

---

# 33. Mobile API Authentication

The JSON mode should work with mobile applications.

Analyze:

```text
Laravel Sanctum
Bearer tokens
OAuth2
session cookies
```

Do not couple Bridge to one authentication mechanism.

The authentication layer should remain Laravel's responsibility.

Bridge only determines representation/transport.

---

# 34. Future React Adapter

The protocol must allow:

```text
@bridge/react
```

to consume:

```text
Bridge Page
JSON
SSE
```

without modifying the Laravel server package.

Explain how frontend adapters should be structured.

---

# 35. Future Native Mobile SDK

Consider whether the protocol should be simple enough that a future SDK could be created for:

```text
Flutter
React Native
Swift
Kotlin
```

Do not implement these now.

But ensure the JSON and SSE protocols are documented enough to make them possible later.

---

# 36. Important Architectural Questions

You MUST explicitly answer these questions in the final plan:

1.  Is the initial HTML shell + second Bridge request worth the trade-off?

2.  Can HTTP caching mitigate the extra request?

3.  Should Bridge support a hybrid mode where critical initial props are optionally embedded?

4.  Should JSON mode use Laravel API Resources?

5.  Should Bridge define its own resource abstraction?

6.  Should SSE update props directly or invalidate resources?

7.  How should SSE reconnect?

8.  How should SSE authenticate?

9.  How should SSE work with PHP-FPM?

10. Should Laravel Reverb be supported?

11. Should Redis be required?

12. How should multi-user real-time events be isolated?

13. How should tenant-specific events be isolated?

14. Should SSE be part of the core package or a separate package?

15. How should protocol versioning work?

16. How should mobile clients authenticate?

17. How should the same controller return page vs JSON?

18. How should errors be represented consistently across HTML, JSON, Bridge, and SSE?

19. How should caching differ between authenticated browser requests and mobile requests?

20. How should Bridge behave when JavaScript is disabled?

---

# 37. Final Deliverable

Do NOT implement anything.

Do NOT create files.

Do NOT install dependencies.

Do NOT modify the repository.

Produce ONLY a detailed technical implementation plan.

The plan MUST contain:

1.  Executive summary

2.  Architecture principles

3.  Complete architecture diagram

4.  Communication modes

5.  Content negotiation design

6.  Bridge protocol

7.  JSON protocol

8.  SSE protocol

9.  Laravel package architecture

10. Vue package architecture

11. Router architecture

12. Props architecture

13. Lazy/deferred architecture

14. Forms

15. Validation

16. File uploads

17. Partial reload

18. Prefetch

19. JSON/mobile architecture

20. SSE architecture

21. Authentication

22. Authorization

23. Security

24. Caching

25. Performance

26. SSR/SEO

27. Playground

28. Repository structure

29. File-by-file implementation plan

30. Testing strategy

31. CI/CD

32. Documentation

33. Future React adapter

34. Future mobile SDK

35. Risks

36. Alternatives considered

37. Implementation phases

38. Definition of Done

39. Recommended V1 scope

40. Recommended first milestone

The plan must be detailed enough that the next instruction can simply be:

> "Implement Phase 1."

and development can begin without redesigning the architecture.
