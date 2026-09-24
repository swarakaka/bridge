import { expect, test } from '../fixtures/test'

test.describe('history encryption', () => {
  test('signed-in pages are sealed in history and unreadable after signing out', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/customers')
    const row = page.getByTestId('customer-row').first().getByRole('link')
    const name = (await row.textContent())?.trim() ?? ''
    await row.click()
    await expect(page.getByTestId('customer-name')).toHaveText(name)

    // The entry holds a sealed payload and nothing readable.
    await expect
      .poll(() =>
        page.evaluate(() => Boolean((window.history.state as { sealed?: unknown }).sealed)),
      )
      .toBe(true)
    const stored = await page.evaluate(() => JSON.stringify(window.history.state))
    expect(stored).not.toContain(name)
    expect(stored).not.toContain('"page"')

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

    // Back cannot decrypt the customer page any more: it is requested again, and the
    // server sends the guest to the login page.
    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('customer-name')).toHaveCount(0)
  })

  test('back restores a sealed page without a request while signed in', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    const row = page.getByTestId('customer-row').first().getByRole('link')
    const name = (await row.textContent())?.trim() ?? ''
    await row.click()
    await expect(page.getByTestId('customer-name')).toHaveText(name)
    await page.getByRole('link', { name: 'Customers' }).first().click()
    await expect(page).toHaveURL(/\/customers$/)

    const requests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/customers/')) requests.push(request.url())
    })
    await page.goBack()
    await expect(page.getByTestId('customer-name')).toHaveText(name)
    expect(requests).toEqual([])
  })
})
