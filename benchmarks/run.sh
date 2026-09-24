#!/usr/bin/env bash
# Reproducible benchmarks. Requires: pnpm install, pnpm build, playground composer install
# and playground pnpm build. See RESULTS.md for recorded runs.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter bridge-benchmarks bench "${1:-all}"
