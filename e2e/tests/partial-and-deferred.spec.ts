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

  test('a deferred-once chart loads on the first visit only', async ({ page, login }) => {
    await login()
    const charts: string[] = []
    const onceHeaders: string[] = []
    page.on('request', (request) => {
      const only = request.headers()['x-bridge-only']
      if (only?.includes('signups')) charts.push(only)
      const held = request.headers()['x-bridge-once']
      if (held) onceHeaders.push(held)
    })

    await page.goto('/')
    await expect(page.getByTestId('signups')).toBeVisible()
    expect(charts).toEqual(['signups'])

    // Back to the dashboard inside the app: the tab holds the chart, so it is filled in.
    await page.getByRole('link', { name: 'Customers', exact: true }).click()
    await expect(page).toHaveURL(/\/customers$/)
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByTestId('signups')).toBeVisible()
    await expect(page.getByTestId('stat-customers')).toHaveText(/\d+/)

    expect(charts).toEqual(['signups'])
    expect(onceHeaders.some((held) => held.split(',').includes('signups'))).toBe(true)
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

test.describe('load when visible', () => {
  test('a lazy prop loads once when its section scrolls into view', async ({ page, login }) => {
    await login()
    // A short viewport keeps the Activity section below the fold.
    await page.setViewportSize({ width: 1024, height: 220 })
    const loads: string[] = []
    page.on('request', (request) => {
      const only = request.headers()['x-bridge-only']
      if (only) loads.push(only)
    })

    await page.goto('/customers/2')
    await expect(page.getByTestId('activity-loading')).toBeAttached()
    await page.waitForTimeout(300)
    expect(loads).toEqual([])

    await page.getByTestId('activity').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('activity')).toContainText('Customer created')
    await expect(page.getByTestId('activity-loading')).toHaveCount(0)

    // Scrolling away and back does not load it again.
    await page.mouse.wheel(0, -2000)
    await page.getByTestId('activity').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    expect(loads).toEqual(['activity'])
  })
})
