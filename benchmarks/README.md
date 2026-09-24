# Benchmarks

Reproducible benchmarks for Bridge's modes. `run.sh` (or `pnpm --filter bridge-benchmarks bench [all|http|sse|serialization]`) boots the playground on PHP's built-in server from a fresh seeded SQLite database, measures throughput and payload size per mode with a fetch-based load generator, opens concurrent streams and times one broadcast's delivery, and times in-process serialization of a 1,000-row page. Each run appends a dated section to `RESULTS.md` and writes raw JSON to `results/`.

Options: `BENCH_URL` (benchmark an existing server, e.g. FPM or FrankenPHP), `BENCH_TOKEN`, `BENCH_DURATION`, `BENCH_CONNECTIONS`, `BENCH_STREAMS`, `BENCH_WORKERS`, `BRIDGE_STREAM_DRIVER=redis`, `BENCH_DEBUG=1`. Needs `pnpm build` at the root, `composer install` and `pnpm build` in `playground/`; the harness writes `playground/.env.e2e` itself when an E2E run has not. The Inertia baseline app from the plan is not built yet, so results compare Bridge modes only.

No performance claim may appear in the documentation without an entry in `RESULTS.md` produced by `run.sh`.
