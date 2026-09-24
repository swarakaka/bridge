import { expect, test } from '../fixtures/test'

test.describe('merge props and precognition', () => {
  test('load more appends the next page instead of replacing it', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    await expect(page.getByTestId('customer-row')).toHaveCount(20)

    const partial = page.waitForRequest(
      (r) => r.headers()['x-bridge-only'] === 'customers' && r.url().includes('page=2'),
    )
    await page.getByTestId('load-more').click()
    await partial

    await expect(page.getByTestId('customer-row')).toHaveCount(40)
    await expect(page.getByTestId('load-more')).toContainText('40 of')
    await expect(page).toHaveURL(/page=2/)
  })

  test('fields validate live on blur through Precognition', async ({ page, login }) => {
    await login()
    await page.goto('/customers/create')

    const precognition = page.waitForResponse(
      (r) => r.request().headers()['precognition'] === 'true',
    )
    await page.getByLabel('email').fill('not-an-email')
    await page.getByLabel('email').blur()
    const response = await precognition
    expect(response.status()).toBe(422)
    expect(response.request().headers()['precognition-validate-only']).toBe('email')

    await expect(page.getByTestId('error-email')).toContainText('valid email')
    // Other fields were not validated.
    await expect(page.getByTestId('error-name')).toHaveCount(0)

    const ok = page.waitForResponse((r) => r.request().headers()['precognition'] === 'true')
    await page.getByLabel('email').fill('fine@example.com')
    await page.getByLabel('email').blur()
    expect((await ok).status()).toBe(204)
    await expect(page.getByTestId('error-email')).toHaveCount(0)
    await expect(page.getByTestId('valid-email')).toBeVisible()
    await expect(page.getByTestId('valid-name')).toHaveCount(0)
    await expect(page).toHaveURL(/\/customers\/create$/)
  })

  test('navigation exposes the current page and a skip link', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    await expect(
      page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Customers', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  })
})
