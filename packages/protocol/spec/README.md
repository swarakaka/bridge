# Bridge Protocol — Version 1 (draft)

This directory is the normative specification of the Bridge protocol. Implementations (the Laravel package, `@swarakaka/bridge-core`, and any third-party adapter or SDK) MUST conform to it. Where the specification and an implementation disagree, the implementation is wrong.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

| Document                         | Covers                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------ |
| [negotiation.md](negotiation.md) | How a request's `Accept` header selects a mode                                 |
| [headers.md](headers.md)         | Every request and response header, standard and custom                         |
| [page.md](page.md)               | Page mode: the page object, partial responses, deferred props, build conflicts |
| [json.md](json.md)               | JSON mode: the `{ data, meta }` envelope and Laravel-native shapes             |
| [errors.md](errors.md)           | The error model and its representation in every mode                           |
| [stream.md](stream.md)           | Stream mode: `text/event-stream` framing, control events, replay               |
| [versioning.md](versioning.md)   | Protocol versioning and compatibility rules                                    |

Machine-readable counterparts live in `../schemas` (JSON Schema 2020-12) and `../fixtures` (golden examples).

## Status

Draft for protocol version `1`. It becomes final when Phase 3 of `docs/PLAN.md` ships. Until then, breaking changes are allowed but MUST be reflected in the schemas and fixtures in the same change.

## Terminology

- **Mode** — one of `html`, `page`, `json`, `stream`. The representation a response uses.
- **Page object** — the JSON document describing a page: component name, URL, and props.
- **Props** — a JSON object of named values produced by the server for a page.
- **Partial response** — a page object that contains only a requested subset of props.
- **Control event** — a stream event with the reserved event name `bridge`.
- **Application event** — a stream event with any other event name.
- **Channel** — a named topic a stream subscribes to and publishers publish to.
- **Build** — an opaque identifier of the client's compiled assets.
