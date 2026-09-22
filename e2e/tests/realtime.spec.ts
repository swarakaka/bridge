import { expect, test } from '../fixtures/test'
import type { Browser, Page } from '@playwright/test'

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('ada@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('user-name')).toHaveText('Ada Lovelace')
}

async function secondBrowser(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page)
  return page
}

test.describe('realtime', () => {
  test('connects, shows heartbeats, and survives the server-side max duration', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/realtime')
    await expect(page.getByTestId('stream-state')).toHaveText('open')
    await expect(
      page.getByTestId('event-log').locator('[data-name="bridge:ready"]').first(),
    ).toBeVisible()
    await expect(
      page.getByTestId('event-log').locator('[data-name="heartbeat"]').first(),
    ).toBeVisible({ timeout: 10_000 })

    // max_duration is 8 s in the e2e env: the server ends with reconnect:true and the client reconnects.
    await expect(
      page.getByTestId('event-log').locator('[data-name="bridge:end"]').first(),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('reconnects')).toHaveText('1', { timeout: 10_000 })
    await expect(page.getByTestId('stream-state')).toHaveText('open')
  })

  test('delivers notifications and prop pushes to the private channel', async ({ page, login }) => {
    await login()
    await page.goto('/realtime')
    await expect(page.getByTestId('stream-state')).toHaveText('open')

    await page.getByTestId('notify-form').locator('input').fill('Private hello')
    await page.getByTestId('send-notification').click()
    await expect(page.getByTestId('notification').first()).toContainText('Private hello')
    await expect(
      page.getByTestId('event-log').locator('[data-name="bridge:notification"]').first(),
    ).toBeVisible()

    await page.getByTestId('push-prop').click()
    await expect(page.getByTestId('push-prop')).not.toContainText('(now 0)')
    await expect(
      page.getByTestId('event-log').locator('[data-name="bridge:prop"]').first(),
    ).toBeVisible()
  })

  test('invalidation refetches only the affected props', async ({ page, login }) => {
    await login()
    await page.goto('/realtime')
    await expect(page.getByTestId('stream-state')).toHaveText('open')

    const partial = page.waitForRequest((r) =>
      (r.headers()['x-bridge-only'] ?? '').includes('customersCount'),
    )
    await page.getByTestId('invalidate').click()
    const request = await partial
    expect(request.headers()['x-bridge-component']).toBe('Realtime')
    await expect(
      page.getByTestId('event-log').locator('[data-name="bridge:invalidate"]').first(),
    ).toBeVisible()
  })

  test('a customer created in browser A updates browser B', async ({ page, login, browser }) => {
    await login()
    await page.goto('/realtime')
    await expect(page.getByTestId('stream-state')).toHaveText('open')
    const before = Number(await page.getByTestId('customers-count').textContent())

    const other = await secondBrowser(browser)
    await other.goto('/customers/create')
    await other.getByLabel('name').fill('From browser A')
    await other.getByLabel('email').fill(`a-${Date.now()}@example.com`)
    await other.getByTestId('submit').click()
    await expect(other.getByTestId('customer-name')).toHaveText('From browser A')

    // Browser B receives the application event and the customers list invalidation.
    await expect(
      page.getByTestId('event-log').locator('[data-name="customer.created"]').first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('customers-count')).toHaveText(String(before + 1), {
      timeout: 10_000,
    })

    // And on the customers list, the invalidation reloads the table.
    await page.goto('/customers')
    await expect(page.getByTestId('stream-state')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-bridge-stream', 'open')
    const rowsBefore = await page.getByTestId('customer-row').count()
    await other.goto('/customers/create')
    await other.getByLabel('name').fill('Second from A')
    await other.getByLabel('email').fill(`a2-${Date.now()}@example.com`)
    await other.getByTestId('submit').click()
    await expect(other.getByTestId('customer-name')).toHaveText('Second from A')
    await expect(page.getByTestId('customer-row')).toHaveCount(rowsBefore, { timeout: 10_000 })
    await expect(page.getByTestId('customer-row').first()).toContainText('Second from A', {
      timeout: 10_000,
    })
    await other.context().close()
  })

  test('the server can end a connection and the client reconnects immediately', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/realtime')
    await expect(page.getByTestId('stream-state')).toHaveText('open')
    await page.getByTestId('end-connection').click()
    await expect(
      page.getByTestId('event-log').locator('[data-name="bridge:end"]').first(),
    ).toBeVisible()
    await expect(page.getByTestId('reconnects')).toHaveText('1')
    await expect(page.getByTestId('stream-state')).toHaveText('open')
  })

  test('a producer stream reports progress and ends without reconnecting', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/realtime')
    await page.getByTestId('run-export').click()
    await expect(page.getByTestId('export')).toBeVisible()
    await expect(page.getByTestId('export-rows')).toContainText('rows', { timeout: 10_000 })
  })
})
