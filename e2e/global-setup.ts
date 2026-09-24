import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { database, e2eEnv, playground } from './playwright.config'

/**
 * Runs the playground under APP_ENV=e2e with its own `.env.e2e` (debug off,
 * dedicated SQLite file, file sessions) and a freshly seeded database.
 */
export default function globalSetup(): void {
  const envFile = path.join(playground, '.env.e2e')
  if (!existsSync(envFile)) {
    const base = readFileSync(path.join(playground, '.env.example'), 'utf8')
    const overrides = e2eEnv
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
  // Start from new files. `migrate:fresh` only truncates a SQLite file, and with WAL
  // mode a leftover -wal/-shm from an interrupted run is then replayed onto the empty
  // file, which corrupts it ("file is not a database").
  for (const file of [database, `${database}-wal`, `${database}-shm`]) rmSync(file, { force: true })
  writeFileSync(database, '')
  const env = { ...process.env, ...e2eEnv }
  execSync('php artisan migrate --seed --force', { cwd: playground, env, stdio: 'inherit' })
  if (
    !existsSync(`${playground}/public/build/manifest.json`) ||
    !existsSync(`${playground}/bootstrap/ssr/ssr.js`)
  ) {
    execSync('pnpm build', { cwd: playground, stdio: 'inherit' })
  }
}
