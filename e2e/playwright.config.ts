import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const playground = path.resolve(here, '..', 'playground')
export const database = path.join(playground, 'database', 'e2e.sqlite')
const port = Number(process.env.E2E_PORT ?? 8787)
const baseURL = `http://127.0.0.1:${port}`

/**
 * Passed explicitly to every PHP process (explicit env beats .env files, and
 * `artisan serve --no-reload` forwards its own environment to the workers).
 */
export const e2eEnv: Record<string, string> = {
  APP_ENV: 'e2e',
  APP_DEBUG: 'false',
  APP_URL: baseURL,
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

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `php artisan serve --host=127.0.0.1 --port=${port} --no-reload`,
    cwd: playground,
    url: `${baseURL}/up`,
    reuseExistingServer: !process.env.CI,
    // PHP's built-in server is single-threaded; SSE holds a connection open, so give it workers.
    env: { ...e2eEnv, PHP_CLI_SERVER_WORKERS: '12' },
    timeout: 60_000,
  },
})
