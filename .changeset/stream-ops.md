---
'@swarakaka/bridge-core': patch
---

`StreamClient` resets its backoff only after a healthy connection, so a server that keeps refusing streams (429) sees growing delays instead of a retry every `retry` interval.
