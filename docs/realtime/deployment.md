# Deploying streams

Bridge streams are long-lived HTTP responses. Each open stream occupies one PHP worker for its lifetime, so the deployment shape matters more than for ordinary requests.

## How Bridge keeps PHP viable

- **Bounded lifetime.** Every connection ends after `bridge.stream.max_duration_s` (60 s on classic PHP, 300 s on Octane) with `end{reason:"max_duration", reconnect:true}`. The client reconnects at once with `Last-Event-ID`, replays what it missed, and users notice nothing. Workers recycle, and deploys never wait on hour-long connections.
- **Blocking reads.** The stream waits inside the bus (`XREAD BLOCK` on Redis, a polling sleep on the database driver) instead of spinning.
- **Heartbeats and abort detection.** A `: hb` comment every `heartbeat_ms` keeps proxies from timing out and lets PHP notice a closed socket, after which the loop exits and the per-user counter is released.
- **Per-user cap.** `max_connections_per_user` (default 3) refuses extra streams with `error{429}` + `end{reconnect:true}`; the client backs off.
- **Publishing is decoupled.** Queue workers, jobs and the scheduler only publish to the bus. A future external relay can serve the streams while Laravel keeps publishing.

Run `php artisan bridge:doctor --url=https://your.app/events --token=...` after deploying. It checks PHP output settings, the bus round trip and the time to the first stream byte (slow first bytes mean a buffering proxy).

## Runtimes

| Runtime                             | Notes                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PHP-FPM + Nginx                     | Works. One FPM child per open stream. Size `pm.max_children` for expected concurrent streams plus normal traffic, or route the stream path to a dedicated pool.                                                                                                                                                                                                                              |
| Apache (mod_php or php-fpm)         | Same sizing rules. Disable `mod_deflate` for `text/event-stream`.                                                                                                                                                                                                                                                                                                                            |
| Caddy                               | Flushes by default. For `reverse_proxy` set `flush_interval -1`.                                                                                                                                                                                                                                                                                                                             |
| FrankenPHP (worker mode)            | Recommended. Cheaper per-connection cost; still one worker per stream. Raise `max_duration_s`.                                                                                                                                                                                                                                                                                               |
| Laravel Octane (Swoole, RoadRunner) | Works with `StreamedResponse`; one worker per stream. Bridge detects Octane and defaults to 300 s.                                                                                                                                                                                                                                                                                           |
| `php artisan serve`                 | Development only. Set `PHP_CLI_SERVER_WORKERS=8` and use `--no-reload`, otherwise a single open stream blocks every other request. Stop it with Ctrl+C in its terminal: killing only the parent orphans the workers, whose dead stdout pipe makes Laravel's router print a broken-pipe notice into every response. The playground's `serve.sh` shows a safer way to run the built-in server. |

## Nginx

```nginx
location /events {
    proxy_pass http://php-upstream;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;          # Bridge also sends X-Accel-Buffering: no
    proxy_cache off;
    gzip off;
    proxy_read_timeout 300s;      # > bridge.stream.max_duration_s
}
```

For PHP-FPM behind Nginx, add `fastcgi_buffering off;` on the stream location.

## Bus drivers

| Driver     | When                                  | Notes                                                                                                                                                                                                             |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redis`    | Production                            | Redis Streams: `XADD ... MAXLEN ~ 1000` per channel, `XREAD BLOCK` across channels. Replay via `Last-Event-ID`. Works with phpredis and predis.                                                                   |
| `database` | No Redis available, small deployments | Polling (`poll_ms`, default 1000). Run `bridge:stream:prune` on a schedule (`retain_minutes`, default 60). On SQLite enable WAL (`journal_mode => 'wal'`) and a `busy_timeout`, otherwise pollers starve writers. |
| `sync`     | Tests, one-off producer streams       | In-process only.                                                                                                                                                                                                  |
| `null`     | Disable publishing                    |                                                                                                                                                                                                                   |

Set `BRIDGE_STREAM_PREFIX` when several apps share one Redis.

### Replay and ordering

A reconnecting client sends `Last-Event-ID`. When pruning (`database`) or `MAXLEN` trimming (`redis`) has removed events after that id, the server answers `replayed: false` and the client reloads its props instead of silently missing events.

On MySQL and PostgreSQL an auto-increment id is taken at insert but becomes visible at commit, so a row published inside a long transaction can appear after rows with higher ids. The database bus re-checks the last `lookback` ids (default 200) on every poll and delivers such rows late, without an SSE `id`. Publish after commit when the event describes data written in a transaction: implement `Illuminate\Contracts\Events\ShouldDispatchAfterCommit` on `ShouldStream` events, or wrap `Bridge::to()` in `DB::afterCommit()`. This also avoids streaming events for work that is rolled back.

## Sizing rule of thumb

```
workers needed ≈ concurrent streams + peak ordinary requests in flight
```

Measure with `bridge:doctor` and the [benchmarks](/advanced/benchmarks) before promising numbers.
