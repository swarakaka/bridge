---
'@swarakaka/bridge-protocol': patch
---

Page visits now look like browser navigations to Laravel code: after negotiation, `HandleBridgeRequests` replaces `Accept` with `text/html, application/xhtml+xml`, so `wantsJson()`/`expectsJson()` are false and Fortify and similar packages redirect instead of answering with JSON. The client's header is kept in `Negotiation::ORIGINAL_ACCEPT_ATTRIBUTE`. `spec/negotiation.md` gains a non-normative note on this. JSON and stream modes are unchanged.
