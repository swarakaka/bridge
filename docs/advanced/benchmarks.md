# Benchmarks

No performance claim is made without a reproducible run. `benchmarks/run.sh` in the repository boots the playground, measures each mode's throughput and payload size with a fetch-based load generator, opens concurrent streams and times the delivery of one broadcast, and times in-process serialization of a 1,000-row page. Every run appends a dated section with hardware, versions and the exact command to `benchmarks/RESULTS.md`.

```bash
pnpm --filter bridge-benchmarks bench
```

What the harness does not yet do: run the reference baseline application planned in the technical plan, or run under PHP-FPM or FrankenPHP in CI. Numbers from PHP's built-in server compare Bridge's modes with each other; they say nothing about production throughput. Use `php artisan bridge:doctor` and your own load tests against your real deployment before sizing stream workers.

See `benchmarks/RESULTS.md` in the repository for recorded runs.
