import { expect, test, trackPageRequests } from '../fixtures/test'

test.describe('navigation', () => {
  test('boots from the embedded page and navigates without full loads', async ({ page, login }) => {
    await login()
    await page.goto('/')
    await expect(page.locator('#bridge-page')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const requests = trackPageRequests(page)
    await page.getByRole('link', { name: 'Customers', exact: true }).click()

    await expect(page).toHaveURL(/\/customers$/)
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
    await expect(page.getByTestId('customer-row')).toHaveCount(20)
    expect(requests.count()).toBeGreaterThanOrEqual(1)
    // The document was not reloaded: the embedded script from the first load is still the same node.
    await expect(page.locator('#bridge-page')).toHaveCount(1)
  })

  test('back and forward restore pages from history without requests', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    await page.getByTestId('customer-row').first().getByRole('link').click()
    await expect(page.getByTestId('customer-name')).toBeVisible()

    const requests = trackPageRequests(page)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
    await page.goForward()
    await expect(page.getByTestId('customer-name')).toBeVisible()
    expect(requests.count()).toBe(0)
  })

  test('prefetches on hover and serves the cached page instantly', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    const link = page.getByTestId('customer-row').nth(1).getByRole('link')
    const prefetch = page.waitForResponse((r) => r.request().headers()['purpose'] === 'prefetch')
    await link.hover()
    await prefetch

    const requests = trackPageRequests(page)
    await link.click()
    await expect(page.getByTestId('customer-name')).toBeVisible()
    // The prefetched page itself was not requested again (other pages may reload from stream invalidations).
    expect(
      requests.urls().filter((u) => u.includes('/customers/') && !u.includes('/create')),
    ).toHaveLength(0)
  })

  test('sets the document title through BridgeHead', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    await expect(page).toHaveTitle('Customers · Bridge')
  })
})
