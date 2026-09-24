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
  DB_JOURNAL_MODE: 'wal',
  DB_BUSY_TIMEOUT: '5000',
  BRIDGE_STREAM_POLL_MS: '200',
  BRIDGE_STREAM_HEARTBEAT_MS: '2000',
  BRIDGE_STREAM_MAX_DURATION: '8',
  BRIDGE_STREAM_MAX_CONNECTIONS: '20',
  BRIDGE_STREAM_CONNECTS_PER_MINUTE: '1000',
  // SSR is on for the whole suite: every page load hydrates server-rendered markup.
  BRIDGE_SSR_ENABLED: 'true',
  BRIDGE_SSR_URL: 'http://127.0.0.1:13715',
}

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  // PHP's built-in server runs one request per worker, and a worker can take a second
  // new connection just before it starts a page's SSE stream; that request then waits
  // until the stream ends (max_duration). Assertions may wait a little longer than
  // that, so such a request still completes instead of failing the test at random.
  expect: { timeout: (Number(e2eEnv.BRIDGE_STREAM_MAX_DURATION) + 2) * 1000 },
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
  webServer: [
    {
      command: 'node bootstrap/ssr/ssr.js',
      cwd: playground,
      url: 'http://127.0.0.1:13715/health',
      reuseExistingServer: !process.env.CI,
      env: { BRIDGE_SSR_URL: 'http://127.0.0.1:13715' },
      timeout: 30_000,
    },
    {
      command: `php artisan serve --host=127.0.0.1 --port=${port} --no-reload`,
      cwd: playground,
      url: `${baseURL}/up`,
      reuseExistingServer: !process.env.CI,
      // PHP's built-in server is single-threaded; SSE holds a connection open, so give it workers.
      env: { ...e2eEnv, PHP_CLI_SERVER_WORKERS: '12' },
      timeout: 60_000,
    },
  ],
})
