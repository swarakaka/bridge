import { expect, test } from '../fixtures/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

test.describe('forms', () => {
  test('shows validation errors from a 422 without leaving the page', async ({ page, login }) => {
    await login()
    await page.goto('/customers/create')
    await page.getByTestId('submit').click()

    await expect(page.getByTestId('error-name')).toContainText('required')
    await expect(page.getByTestId('error-email')).toContainText('required')
    await expect(page).toHaveURL(/\/customers\/create$/)
    await expect(page.getByTestId('submit')).toBeEnabled()
  })

  test('creates a customer, follows the 303 and shows the flash', async ({ page, login }) => {
    await login()
    await page.goto('/customers/create')
    await page.getByLabel('name').fill('Playwright Co')
    await page.getByLabel('email').fill(`pw-${Date.now()}@example.com`)
    await page.getByLabel('company').fill('E2E')
    await page.getByTestId('submit').click()

    await expect(page).toHaveURL(/\/customers\/\d+$/)
    await expect(page.getByTestId('customer-name')).toHaveText('Playwright Co')
    await expect(page.getByTestId('toast')).toContainText('Customer created.')
  })

  test('uploads an avatar with progress and method spoofing', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    await page.getByTestId('customer-row').nth(2).getByRole('link').click()
    await page.getByTestId('edit').click()
    await expect(page.getByTestId('customer-form')).toBeVisible()

    await page.getByLabel(/Avatar/).setInputFiles(path.join(here, '..', 'fixtures', 'avatar.png'))
    // Files force a multipart POST with `_method=PUT` (Playwright does not expose multipart bodies, so
    // the resulting update below proves the spoofed method reached the PUT route).
    const upload = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        (r.headers()['content-type'] ?? '').includes('multipart/form-data'),
    )
    await page.getByTestId('submit').click()
    const request = await upload
    expect(request.url()).toMatch(/\/customers\/\d+$/)

    await expect(page).toHaveURL(/\/customers\/\d+$/)
    await expect(page.getByTestId('avatar')).toBeVisible()
    await expect(page.getByTestId('toast')).toContainText('Customer updated.')
  })

  test('deletes a customer and returns to the list', async ({ page, login }) => {
    await login()
    await page.goto('/customers/create')
    await page.getByLabel('name').fill('Doomed')
    await page.getByLabel('email').fill(`doomed-${Date.now()}@example.com`)
    await page.getByTestId('submit').click()
    await expect(page.getByTestId('customer-name')).toHaveText('Doomed')

    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('delete').click()
    await expect(page).toHaveURL(/\/customers$/)
    await expect(page.getByTestId('toast')).toContainText('Customer deleted.')
  })
})
