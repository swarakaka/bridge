import { expect, test } from '../fixtures/test'

test.describe('polling', () => {
  test('the dashboard reloads only the polled prop, in the background', async ({ page }) => {
    const polls: string[] = []
    page.on('request', (request) => {
      const only = request.headers()['x-bridge-only']
      if (only?.includes('serverTime')) polls.push(only)
    })
    await page.goto('/')
    const time = page.getByTestId('server-time')
    const first = (await time.textContent()) ?? ''

    // Two consecutive updates, about 3 s apart.
    await expect.poll(async () => time.textContent(), { timeout: 8000 }).not.toBe(first)
    const second = (await time.textContent()) ?? ''
    await expect.poll(async () => time.textContent(), { timeout: 8000 }).not.toBe(second)

    expect(polls.length).toBeGreaterThanOrEqual(2)
    expect(polls.every((only) => only === 'serverTime')).toBe(true)
    // Background reloads keep the navigation indicator hidden.
    await expect(page.getByTestId('progress')).toBeHidden()

    // Leaving the page stops the poll.
    await page.getByRole('link', { name: 'Customers', exact: true }).click()
    await expect(page).toHaveURL(/\/(customers|login)$/)
    const after = polls.length
    await page.waitForTimeout(4000)
    expect(polls.length).toBe(after)
  })
})
