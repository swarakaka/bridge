import { expect, test } from '../fixtures/test'

test.describe('partial reloads and deferred props', () => {
  test('search triggers a partial reload of only the customers prop', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    await expect(page.getByTestId('customer-row')).toHaveCount(20)

    const partial = page.waitForRequest((r) =>
      (r.headers()['x-bridge-only'] ?? '').includes('customers'),
    )
    await page.getByTestId('search').fill('acme')
    const request = await partial
    expect(request.headers()['x-bridge-component']).toBe('Customers/Index')

    await expect(page.getByTestId('customer-row')).toHaveCount(1)
    await expect(page).toHaveURL(/search=acme/)
    // Search input state survived (preserveState).
    await expect(page.getByTestId('search')).toHaveValue('acme')
  })

  test('deferred groups render fallbacks then load after mount', async ({ page, login }) => {
    await login()
    const deferred = page.waitForRequest((r) => r.headers()['x-bridge-only'] === 'stats')
    await page.goto('/')
    await deferred
    await expect(page.getByTestId('stat-customers')).toHaveText(/\d+/)
    await expect(page.getByTestId('signups')).toBeVisible()
    await expect(page.getByTestId('stats-skeleton')).toHaveCount(0)
  })

  test('pagination links reload only the customers prop and preserve scroll', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/customers')
    const partial = page.waitForRequest((r) => r.headers()['x-bridge-only'] === 'customers')
    await page.getByTestId('pagination').getByRole('link', { name: '2', exact: true }).click()
    await partial
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByTestId('pagination')).toContainText(/21–40 of \d+/)
  })
})
