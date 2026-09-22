# Versioning

## 1. What is versioned

The **page** representation and the **stream** control events are versioned together as the Bridge protocol version, an integer starting at `1`. The JSON representation is not versioned by Bridge (it is the application's API). HTML shells declare the protocol version of their embedded page.

## 2. Where the version appears

| Place                 | Form                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Page request          | `Accept: application/vnd.bridge+json; v=1`                                                 |
| Page response         | `Content-Type: application/vnd.bridge+json; v=1` and `"protocol": 1` in the body           |
| Embedded page in HTML | `"protocol": 1` in the `#bridge-page` JSON and `<meta name="bridge-protocol" content="1">` |
| Stream                | `"protocol": 1` in the `ready` control event                                               |

The media type parameter is authoritative for negotiation; the body field exists so documents are self-describing when no HTTP headers are available (embedded page, fixtures, logs).

Rejected: version suffixes in the media type (`application/vnd.bridge.v1+json`). They multiply media types, complicate `Accept` parsing, and add `Vary` dimensions; RFC 9110 parameters are the standard mechanism.

## 3. Compatibility rules

- **Additive changes do not bump the version.** New optional members in page objects, new `meta` members, new control event types, new error kinds. Clients MUST ignore unknown members, event types, and kinds.
- **Breaking changes bump the version.** Removing or renaming a member, changing a type, changing the meaning of an existing control event, changing negotiation rules.
- A server advertises the highest version it supports. A client requests exactly one version. If the server does not support it, it responds `406` (see [negotiation.md](negotiation.md) §3) and the client falls back to a full document load, which delivers a shell whose bundled client matches the server.
- Servers MUST NOT respond with a version other than the one requested.

## 4. Package versions

Package versions (Composer, npm) follow semver independently of the protocol version. A package's documentation states which protocol versions it speaks. The Laravel package may support several protocol versions at once during a migration window; clients speak one.
