# How it works

## First load

The browser requests `/customers` with `Accept: text/html`. Laravel runs the route, the controller returns `Bridge::render('Customers/Index', [...])`, and Bridge answers with the shell view. The page object is embedded in a `<script type="application/json" id="bridge-page">` block next to the root element. The client reads it, resolves the component and mounts. With [server-side rendering](/advanced/server-side-rendering) the root already contains HTML and the client hydrates it.

## Navigation

Clicking a `<BridgeLink>` or calling `router.visit()` requests the next URL with `Accept: application/vnd.bridge+json; v=1`. The same controller runs; Bridge answers with the page object only. The client swaps the component, pushes the URL to history and restores or resets scroll.

## Other clients

A request with `Accept: application/json` gets `{ data, meta }` from the same controller. A stream route answers `text/event-stream`.

## Errors and redirects

Exceptions are mapped once, centrally, to the right shape per mode: Laravel's usual behaviour for HTML, a Bridge error object for page requests, Laravel-native JSON for JSON requests. Redirects become `303` for page requests and a result document with a `Location` header for JSON requests.

## Real-time

Any code publishes to channels on an event bus. Browsers subscribed through a stream receive control events, most often "these props are stale", and re-fetch them through the ordinary, authorized page request. See [Streams](/realtime/streams).

The [protocol reference](/reference/protocol) specifies every byte of this; the guide pages describe how to use it.
