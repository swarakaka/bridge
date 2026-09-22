import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { database, playground } from './playwright.config'

/**
 * Runs the playground under APP_ENV=e2e with its own `.env.e2e` (debug off,
 * dedicated SQLite file, file sessions) and a freshly seeded database.
 */
export default function globalSetup(): void {
  const envFile = path.join(playground, '.env.e2e')
  if (!existsSync(envFile)) {
    const base = readFileSync(path.join(playground, '.env.example'), 'utf8')
    const overrides: Record<string, string> = {
      APP_ENV: 'e2e',
      APP_DEBUG: 'false',
      APP_URL: 'http://127.0.0.1:8787',
      DB_CONNECTION: 'sqlite',
      DB_DATABASE: database,
      SESSION_DRIVER: 'file',
      CACHE_STORE: 'file',
      QUEUE_CONNECTION: 'sync',
      LOG_CHANNEL: 'single',
      BRIDGE_BUILD_VERSION: 'e2e',
      BRIDGE_STREAM_DRIVER: 'database',
      BRIDGE_STREAM_POLL_MS: '200',
      BRIDGE_STREAM_HEARTBEAT_MS: '2000',
      BRIDGE_STREAM_MAX_DURATION: '8',
      BRIDGE_STREAM_MAX_CONNECTIONS: '20',
    }
    const seen = new Set<string>()
    const lines = base.split('\n').map((line) => {
      const key = line.split('=')[0]
      if (key && key in overrides) {
        seen.add(key)
        return `${key}=${overrides[key]}`
      }
      return line
    })
    for (const [key, value] of Object.entries(overrides)) {
      if (!seen.has(key)) lines.push(`${key}=${value}`)
    }
    writeFileSync(envFile, lines.join('\n') + '\n')
    execSync('php artisan key:generate --force', {
      cwd: playground,
      env: { ...process.env, APP_ENV: 'e2e' },
      stdio: 'inherit',
    })
  }
  if (!existsSync(database)) writeFileSync(database, '')
  const env = { ...process.env, APP_ENV: 'e2e' }
  execSync('php artisan migrate:fresh --seed --force', { cwd: playground, env, stdio: 'inherit' })
  if (!existsSync(`${playground}/public/build/manifest.json`)) {
    execSync('pnpm build', { cwd: playground, stdio: 'inherit' })
  }
}
