# Benchmark results

Every section is appended by `benchmarks/run.sh` (`pnpm --filter bridge-benchmarks bench`). It records the machine, versions, server shape and the exact command, so numbers can be reproduced or challenged. The harness measures Bridge's modes against each other; it does not yet include the reference baseline app planned in `development/PLAN.md` §25, so no comparative claim against another library is made.

Interpretation notes:

- The playground runs on PHP's built-in server for these runs. Absolute throughput is far below PHP-FPM or FrankenPHP; treat req/s as relative between rows of the same run.
- "bytes" is the response body size for one request.
- The SSE row opens N streams, publishes one broadcast, and measures delivery latency on every stream. With the database bus, latency is bounded by the poll interval.
- Serialization rows time `Bridge::render()->toResponse()` for 1,000 customers in-process, excluding the HTTP layer.

## 2026-09-22T19:18:03.432Z

- Darwin 27.0.0 arm64, Apple M5 (10 cores), PHP 8.4.23, Laravel Framework 13.33.0, Node v24.16.0
- php artisan serve (built-in server), sqlite (WAL), database stream bus, 32 workers, 20 closed-loop connections × 8 s per scenario (fetch-based generator; numbers compare Bridge modes with each other on this setup, not against other servers)
- Command: `pnpm --filter bridge-benchmarks bench all`

| Scenario                              | req/s | p50 ms | p97.5 ms | bytes | errors |
| ------------------------------------- | ----: | -----: | -------: | ----: | -----: |
| HTML shell (embedded page)            |   503 |   13.8 |    183.9 |  7399 |      0 |
| Bridge page                           |   623 |   12.4 |    113.2 |  6465 |      0 |
| Bridge page, partial (only=customers) |   441 |   12.6 |    138.5 |  6308 |      0 |
| JSON mode                             |   487 |   14.3 |    190.9 |  6339 |      0 |
| JSON mode, 200 rows                   |   309 |   25.1 |    245.5 | 47823 |      0 |

SSE: 20 concurrent streams opened (sequentially, ready after 48 ms on average from the start); one broadcast delivered to 100 % of streams, p50 66 ms, max 121 ms (database bus, polling at 100 ms).

| Serialization (1,000 customers) | ms per render |  bytes |
| ------------------------------- | ------------: | -----: |
| Bridge page                     |         15.39 | 233034 |
| JSON mode                       |         15.10 | 232947 |
| HTML shell (embedded page)      |         15.46 | 234163 |

## 2026-09-22T19:18:57.011Z

- Darwin 27.0.0 arm64, Apple M5 (10 cores), PHP 8.4.23, Laravel Framework 13.33.0, Node v24.16.0
- php artisan serve (built-in server), sqlite (WAL), redis stream bus, 32 workers, 20 closed-loop connections × 8 s per scenario (fetch-based generator; numbers compare Bridge modes with each other on this setup, not against other servers)
- Command: `pnpm --filter bridge-benchmarks bench sse`

SSE: 20 concurrent streams opened (sequentially, ready after 159 ms on average from the start); one broadcast delivered to 100 % of streams, p50 21 ms, max 21 ms (redis bus).
