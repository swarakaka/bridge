# Configuration

`php artisan bridge:install` publishes `config/bridge.php`. Keys and defaults:

| Key                        | Default                  | Meaning                                                                                                 |
| -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `protocol.max_version`     | `1`                      | Highest protocol version served. Unsupported requests answer `406`.                                     |
| `shell.view`               | `bridge::app`            | Blade view used for HTML mode. Set `app` for the published one.                                         |
| `shell.embed`              | `true`                   | Embed the page object in the shell. `false` serves a static, cacheable shell and the client bootstraps. |
| `shell.root_id`            | `app`                    | Id of the root element.                                                                                 |
| `build.version`            | `BRIDGE_BUILD_VERSION`   | Build identifier. Falls back to a hash of `build.manifest`.                                             |
| `build.manifest`           | `null`                   | Path to the Vite manifest (default `public/build/manifest.json`).                                       |
| `negotiation.default_mode` | `html`                   | Mode for wildcard-only `Accept` headers. Override per route with `bridge.default_mode`.                 |
| `json.resolve_deferred`    | `true`                   | Resolve deferred props inline in JSON mode.                                                             |
| `auth.login_url`           | `/login`                 | `redirect` hint in `401` page-mode errors.                                                              |
| `flash.keys`               | `['message', 'level']`   | Session keys read into the `flash` shared prop.                                                         |
| `cache.etag`               | `true`                   | Weak `ETag` on page and JSON responses.                                                                 |
| `csrf.skip_for_bearer`     | `true`                   | Let the CSRF variant skip bearer requests without a session cookie.                                     |
| `history.encrypt`          | `BRIDGE_HISTORY_ENCRYPT` | Store every page encrypted in browser history. See [History encryption](/security/history-encryption).  |
| `history.clear_on_logout`  | `true`                   | Clear history (`Bridge::clearHistory()`) on Laravel's `Logout` event.                                   |
| `ssr.enabled`              | `false`                  | Render HTML through the SSR server.                                                                     |
| `ssr.url`                  | `http://127.0.0.1:13714` | SSR server address.                                                                                     |
| `ssr.timeout`              | `2.0`                    | Seconds before falling back to client rendering.                                                        |
| `ssr.cooldown_s`           | `10`                     | After a connection failure or timeout, skip SSR for this many seconds.                                  |
| `ssr.bundle`               | `bootstrap/ssr/ssr.js`   | Bundle started by `bridge:ssr`.                                                                         |
| `middleware.auto_register` | `true`                   | Append the `bridge` middleware to the `web` group (skipped when the group has a subclass).              |

## Streams

| Key                               | Default                                                                         | Meaning                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `stream.driver`                   | `database`                                                                      | Bus driver: `redis`, `database`, `sync`, `null`.                                                                                       |
| `stream.prefix`                   | app name                                                                        | Key or table prefix; set when several apps share one Redis.                                                                            |
| `stream.heartbeat_ms`             | `15000`                                                                         | Interval of `: hb` comments during silence.                                                                                            |
| `stream.max_duration_s`           | `60` (`300` on Octane)                                                          | Connection lifetime before an orderly `end`.                                                                                           |
| `stream.retry_ms`                 | `3000`                                                                          | `retry:` hint sent to clients.                                                                                                         |
| `stream.max_connections_per_user` | `3`                                                                             | Concurrent streams per user.                                                                                                           |
| `stream.connects_per_minute`      | `30`                                                                            | Limit used by `throttle:bridge-stream`.                                                                                                |
| `stream.max_client_channels`      | `20`                                                                            | Maximum `?channels=` entries.                                                                                                          |
| `stream.ticket_ttl_s`             | `60`                                                                            | Lifetime of signed stream tickets.                                                                                                     |
| `stream.drivers.redis`            | `connection: default, maxlen: 1000, retain_minutes: 60`                         | Redis connection, per-channel length, and how long an idle channel's key lives after its last publish.                                 |
| `stream.drivers.database`         | `table: bridge_stream_events, poll_ms: 1000, retain_minutes: 60, lookback: 200` | Table, poll interval, retention pruned by `bridge:stream:prune`, and ids re-checked behind the cursor for rows committed out of order. |

## Commands

| Command               | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `bridge:install`      | Publish config and shell view.                                    |
| `bridge:middleware`   | Create `app/Http/Middleware/HandleBridgeRequests.php`.            |
| `bridge:doctor`       | Check PHP output settings, the bus and stream time-to-first-byte. |
| `bridge:stream:prune` | Trim the database bus. Schedule it.                               |
| `bridge:ssr`          | Start the SSR server from `ssr.bundle`.                           |
