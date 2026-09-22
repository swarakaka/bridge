import { expect, test } from '../fixtures/test'

test.describe('server-side rendering', () => {
  test('the first response contains rendered markup that the client hydrates', async ({
    page,
    login,
  }) => {
    await login()
    // Raw HTML from the server, before any JavaScript runs (page.request shares the signed-in cookies).
    const html = await (
      await page.request.get('/customers', { headers: { Accept: 'text/html' } })
    ).text()
    expect(html).toContain('data-server-rendered="true"')
    expect(html).toContain('<title>Customers · Bridge</title>')
    expect(html).toMatch(/data-testid="customer-row"/)
    expect(html).toContain('id="bridge-page"')

    // Hydration keeps the markup interactive: the search box triggers a partial reload.
    await page.goto('/customers')
    await expect(page.locator('#app')).toHaveAttribute('data-server-rendered', 'true')
    const partial = page.waitForRequest((r) =>
      (r.headers()['x-bridge-only'] ?? '').includes('customers'),
    )
    await page.getByTestId('search').fill('acme')
    await partial
    await expect(page.getByTestId('customer-row')).toHaveCount(1)
  })

  test('guest pages render on the server too', async ({ request }) => {
    const html = await (await request.get('/login', { headers: { Accept: 'text/html' } })).text()
    expect(html).toContain('data-server-rendered="true"')
    expect(html).toContain('data-testid="login-form"')
  })
})
