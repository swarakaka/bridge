import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const playground = path.resolve(here, '..', 'playground')
export const database = path.join(playground, 'database', 'e2e.sqlite')
const port = Number(process.env.E2E_PORT ?? 8787)
const baseURL = `http://127.0.0.1:${port}`

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
    env: { APP_ENV: 'e2e', PHP_CLI_SERVER_WORKERS: '12' },
    timeout: 60_000,
  },
})
