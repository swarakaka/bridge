---
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Polling: `usePoll(interval, reloadOptions, { autoStart, keepAlive })` (Vue and React) reloads the current page's props on a timer while the component is mounted, and `router.poll()` does the same outside components (stopping when another page is shown unless `bindToPage: false`). The next reload is scheduled after the previous one finished, ticks share requests with other reloads, hidden tabs pause and catch up when visible unless `keepAlive`, and no timers run during server rendering. `router.reload()` accepts `showProgress`; polls default to `false` so progress indicators stay hidden.
