/**
 * Runs the HTTP throughput, payload size, SSE latency and PHP serialization
 * benchmarks against a playground server and appends a dated section to
 * benchmarks/RESULTS.md. Usage (from repo root):
 *
 *   pnpm --filter bridge-benchmarks bench            # boots the playground itself
 *   BENCH_URL=http://127.0.0.1:8000 BENCH_TOKEN=... pnpm --filter bridge-benchmarks bench
 */
import { execSync, spawn } from 'node:child_process'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const playground = path.join(root, 'playground')
const port = Number(process.env.BENCH_PORT ?? 8791)
const url = process.env.BENCH_URL ?? `http://127.0.0.1:${port}`
const duration = Number(process.env.BENCH_DURATION ?? 10)
const connections = Number(process.env.BENCH_CONNECTIONS ?? 20)
const scenario = process.argv[2] ?? 'all'

const env = {
  ...process.env,
  APP_ENV: 'e2e',
  APP_DEBUG: 'false',
  APP_URL: url,
  DB_CONNECTION: 'sqlite',
  DB_DATABASE: path.join(playground, 'database', 'bench.sqlite'),
  SESSION_DRIVER: 'file',
  CACHE_STORE: 'file',
  LOG_CHANNEL: 'single',
  BRIDGE_STREAM_DRIVER: process.env.BRIDGE_STREAM_DRIVER ?? 'database',
  // SQLite WAL lets stream pollers and writers (e.g. Sanctum token updates) coexist.
  DB_JOURNAL_MODE: 'wal',
  DB_BUSY_TIMEOUT: '5000',
  BRIDGE_STREAM_POLL_MS: '100',
  BRIDGE_STREAM_HEARTBEAT_MS: '5000',
  BRIDGE_STREAM_MAX_DURATION: '60',
  BRIDGE_STREAM_MAX_CONNECTIONS: '200',
  BRIDGE_STREAM_CONNECTS_PER_MINUTE: '10000',
  PHP_CLI_SERVER_WORKERS: String(process.env.BENCH_WORKERS ?? 32),
}

let server = null
let token = process.env.BENCH_TOKEN ?? ''

async function boot() {
  if (process.env.BENCH_URL) return
  mkdirSync(path.join(here, '..', 'results'), { recursive: true })
  // APP_ENV=e2e reads playground/.env.e2e; everything else comes from `env` above, so
  // the file only needs an app key (the E2E suite writes a fuller one).
  const envFile = path.join(playground, '.env.e2e')
  if (!existsSync(envFile)) {
    copyFileSync(path.join(playground, '.env.example'), envFile)
    execSync('php artisan key:generate --force', { cwd: playground, env, stdio: 'ignore' })
  }
  // New files each run: `migrate:fresh` truncates a SQLite file, and a leftover WAL
  // from an interrupted run would then corrupt it.
  for (const file of [env.DB_DATABASE, `${env.DB_DATABASE}-wal`, `${env.DB_DATABASE}-shm`])
    rmSync(file, { force: true })
  writeFileSync(env.DB_DATABASE, '')
  execSync('php artisan migrate --seed --force', { cwd: playground, env, stdio: 'ignore' })
  execSync('php artisan db:seed --class=BenchmarkSeeder --force', {
    cwd: playground,
    env,
    stdio: 'ignore',
  })
  token = execSync('php artisan bench:token', { cwd: playground, env })
    .toString()
    .trim()
    .split('\n')
    .pop()
  // PHP's built-in server directly (no `artisan serve` parent process and output pipe).
  const router = path.join(
    playground,
    'vendor',
    'laravel',
    'framework',
    'src',
    'Illuminate',
    'Foundation',
    'resources',
    'server.php',
  )
  const log = openSync(path.join(here, '..', 'results', 'server.log'), 'w')
  try {
    await fetch(`${url}/up`)
    throw new Error(
      `Something is already listening on ${url}; stop it (stale php -S workers?) or set BENCH_URL to benchmark it.`,
    )
  } catch (error) {
    if (!(error instanceof TypeError)) throw error // TypeError = connection refused = port free
  }
  // detached: the built-in server forks workers; killing the process group stops all of them.
  // server.php requires ./index.php, so the working directory must be public/ (as `artisan serve` does).
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', '.', router], {
    cwd: path.join(playground, 'public'),
    env,
    stdio: ['ignore', log, log],
    detached: true,
  })
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${url}/up`)
      if (r.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('playground did not start')
}

const auth = () => ({ Authorization: `Bearer ${token}` })

/**
 * Fetch-based closed-loop load generator: `connections` workers each issue
 * requests back to back for `duration` seconds over keep-alive connections.
 */
async function load(target, headers) {
  const latencies = []
  let errors = 0
  const end = performance.now() + duration * 1000
  const worker = async () => {
    while (performance.now() < end) {
      const t0 = performance.now()
      try {
        // Close after each response: idle keep-alive sockets would otherwise pin dev-server workers.
        const r = await fetch(target, { headers: { ...headers, Connection: 'close' } })
        await r.arrayBuffer()
        if (!r.ok) errors++
      } catch {
        errors++
      }
      latencies.push(performance.now() - t0)
    }
  }
  await Promise.all(Array.from({ length: connections }, worker))
  latencies.sort((a, b) => a - b)
  const pct = (p) =>
    latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0
  return {
    total: latencies.length,
    rps: latencies.length / duration,
    p50: pct(0.5),
    p97: pct(0.975),
    errors,
  }
}

async function http(name, headers, pathname = '/customers?page=1') {
  const target = `${url}${pathname}`
  const first = await fetch(target, { headers: { ...headers, ...auth() } })
  const bytes = (await first.arrayBuffer()).byteLength
  const result = await load(target, { ...headers, ...auth() })
  return { name, ...result, bytes }
}

async function sse(streams = 20) {
  const decoder = new TextDecoder()
  const t0 = performance.now()
  const opened = []
  const readers = []
  const buffers = []
  for (let i = 0; i < streams; i++) {
    const r = await fetch(`${url}/events`, { headers: { Accept: 'text/event-stream', ...auth() } })
    const reader = r.body.getReader()
    // A subscription is live once `ready` arrives (spec/stream.md §3); publishing earlier is a race.
    let text = ''
    while (!text.includes('"type":"ready"')) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    opened.push(performance.now() - t0)
    readers.push(reader)
    buffers.push(text)
    if (process.env.BENCH_DEBUG)
      console.log(
        `stream ${i + 1}: ready after ${(performance.now() - t0).toFixed(0)} ms, status ${r.status}`,
      )
  }
  const marker = `bench-${Date.now()}`
  const published = performance.now()
  const post = await fetch(`${url}/realtime/broadcast`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Connection: 'close',
      ...auth(),
    },
    body: JSON.stringify({ message: marker }),
  })
  const postMs = performance.now() - published
  if (process.env.BENCH_DEBUG) console.log(`publish: ${post.status} after ${postMs.toFixed(0)} ms`)
  const arrivals = await Promise.all(
    readers.map(async (reader, i) => {
      let text = buffers[i]
      const deadline = performance.now() + 10_000
      while (performance.now() < deadline) {
        const chunk = await Promise.race([
          reader.read(),
          new Promise((r) => setTimeout(() => r(null), Math.max(1, deadline - performance.now()))),
        ])
        if (!chunk || chunk.done) break
        text += decoder.decode(chunk.value, { stream: true })
        if (text.includes(marker)) return performance.now() - published
      }
      if (process.env.BENCH_DEBUG && i < 2)
        console.log(`stream ${i + 1} received without marker: ${JSON.stringify(text.slice(-400))}`)
      return null
    }),
  )
  for (const reader of readers) await reader.cancel().catch(() => {})
  const ok = arrivals.filter((a) => a !== null).sort((a, b) => a - b)
  return {
    streams,
    connectMsAvg: opened.reduce((a, b) => a + b, 0) / opened.length,
    deliveredPct: (ok.length / streams) * 100,
    deliveryP50: ok[Math.floor(ok.length / 2)] ?? null,
    deliveryMax: ok.at(-1) ?? null,
  }
}

function serialization() {
  const out = execSync('php artisan bench:serialize', { cwd: playground, env }).toString()
  return JSON.parse(out.trim().split('\n').pop())
}

function versions() {
  const php = execSync('php -r "echo PHP_VERSION;"').toString()
  const laravel = execSync(`php artisan --version`, { cwd: playground }).toString().trim()
  return {
    php,
    laravel,
    node: process.version,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
  }
}

try {
  await boot()
  const results = {
    date: new Date().toISOString(),
    versions: versions(),
    config: {
      duration,
      connections,
      workers: env.PHP_CLI_SERVER_WORKERS,
      server: `php artisan serve (built-in server), sqlite (WAL), ${env.BRIDGE_STREAM_DRIVER} stream bus`,
    },
  }

  if (scenario === 'all' || scenario === 'http') {
    results.http = [
      await http('HTML shell (embedded page)', { Accept: 'text/html' }),
      await http('Bridge page', { Accept: 'application/vnd.bridge+json; v=1' }),
      await http('Bridge page, partial (only=customers)', {
        Accept: 'application/vnd.bridge+json; v=1',
        'X-Bridge-Only': 'customers',
        'X-Bridge-Component': 'Customers/Index',
      }),
      await http('JSON mode', { Accept: 'application/json' }),
      await http(
        'JSON mode, 200 rows',
        { Accept: 'application/json' },
        '/customers?page=1&per_page=200',
      ),
    ]
  }
  if (scenario === 'all' || scenario === 'sse')
    results.sse = await sse(Number(process.env.BENCH_STREAMS ?? 20))
  if (scenario === 'all' || scenario === 'serialization') results.serialization = serialization()

  mkdirSync(path.join(here, '..', 'results'), { recursive: true })
  const stamp = results.date.replace(/[:.]/g, '-')
  writeFileSync(path.join(here, '..', 'results', `${stamp}.json`), JSON.stringify(results, null, 2))

  const md = []
  md.push(`\n## ${results.date}\n`)
  md.push(
    `- ${results.versions.os}, ${results.versions.cpu} (${results.versions.cores} cores), PHP ${results.versions.php}, ${results.versions.laravel}, Node ${results.versions.node}`,
  )
  md.push(
    `- ${results.config.server}, ${results.config.workers} workers, ${connections} closed-loop connections × ${duration} s per scenario (fetch-based generator; numbers compare Bridge modes with each other on this setup, not against other servers)`,
  )
  md.push(`- Command: \`pnpm --filter bridge-benchmarks bench ${scenario}\`\n`)
  if (results.http) {
    md.push(
      '| Scenario | req/s | p50 ms | p97.5 ms | bytes | errors |\n| --- | ---: | ---: | ---: | ---: | ---: |',
    )
    for (const r of results.http)
      md.push(
        `| ${r.name} | ${r.rps.toFixed(0)} | ${r.p50.toFixed(1)} | ${r.p97.toFixed(1)} | ${r.bytes} | ${r.errors} |`,
      )
    md.push('')
  }
  if (results.sse) {
    const s = results.sse
    md.push(
      `SSE: ${s.streams} concurrent streams opened (sequentially, ready after ${s.connectMsAvg.toFixed(0)} ms on average from the start); one broadcast delivered to ${s.deliveredPct.toFixed(0)} % of streams, p50 ${s.deliveryP50?.toFixed(0)} ms, max ${s.deliveryMax?.toFixed(0)} ms (${env.BRIDGE_STREAM_DRIVER} bus${env.BRIDGE_STREAM_DRIVER === 'database' ? `, polling at ${env.BRIDGE_STREAM_POLL_MS} ms` : ''}).\n`,
    )
  }
  if (results.serialization) {
    md.push('| Serialization (1,000 customers) | ms per render | bytes |\n| --- | ---: | ---: |')
    for (const r of results.serialization)
      md.push(`| ${r.name} | ${r.ms.toFixed(2)} | ${r.bytes} |`)
    md.push('')
  }
  appendFileSync(path.join(here, '..', 'RESULTS.md'), md.join('\n') + '\n')
  console.log(md.join('\n'))
} finally {
  if (server) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      server.kill()
    }
  }
}
