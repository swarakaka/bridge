#!/usr/bin/env bash
# Development server for the playground.
#
# Runs PHP's built-in server directly from public/ with several workers so
# open SSE streams do not block other requests, and refuses to start when the
# port is already taken (usually orphaned workers from a previous server whose
# parent was killed; their dead stdout pipe makes Laravel's router script print
# "file_put_contents(): Broken pipe" into every response and corrupts JSON).
#
#   ./serve.sh            # http://127.0.0.1:8000
#   PORT=8080 ./serve.sh
#   WORKERS=16 ./serve.sh
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
WORKERS="${WORKERS:-8}"
ROUTER="vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. If it is a stale dev server, stop it with:" >&2
  echo "  lsof -ti :$PORT | xargs kill -9" >&2
  exit 1
fi

if [ ! -f public/build/manifest.json ] && [ ! -f public/hot ]; then
  echo "No frontend build found: run 'pnpm build' (or 'pnpm dev' in another terminal) first." >&2
fi

echo "Bridge playground on http://127.0.0.1:$PORT ($WORKERS workers). Ctrl+C stops all workers."
cd public
# exec keeps this shell's process group so Ctrl+C reaches every worker.
PHP_CLI_SERVER_WORKERS="$WORKERS" exec php -S "127.0.0.1:$PORT" -t . "../$ROUTER"
