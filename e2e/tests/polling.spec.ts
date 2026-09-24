import { expect, test } from '../fixtures/test'

test.describe('polling', () => {
  test('the dashboard reloads only the polled prop, in the background', async ({ page }) => {
    const polls: string[] = []
    page.on('request', (request) => {
      const only = request.headers()['x-bridge-only']
      if (only?.includes('serverTime')) polls.push(only)
    })
    // Record every appearance of the navigation indicator, however brief, from the first paint.
    await page.addInitScript(() => {
      const w = window as unknown as { __progressShown: number }
      w.__progressShown = 0
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of Array.from(record.addedNodes))
            if (node instanceof Element && node.matches('[data-testid="progress"]'))
              w.__progressShown++
      }).observe(document, { childList: true, subtree: true })
    })
    const progressShown = () =>
      page.evaluate(() => (window as unknown as { __progressShown: number }).__progressShown)

    await page.goto('/')
    const time = page.getByTestId('server-time')
    const first = (await time.textContent()) ?? ''

    // Two consecutive updates, about 3 s apart.
    await expect.poll(async () => time.textContent(), { timeout: 8000 }).not.toBe(first)
    const second = (await time.textContent()) ?? ''
    await expect.poll(async () => time.textContent(), { timeout: 8000 }).not.toBe(second)

    expect(polls.length).toBeGreaterThanOrEqual(2)
    expect(polls.every((only) => only === 'serverTime')).toBe(true)
    // Background reloads never showed the navigation indicator, not even for a frame.
    expect(await progressShown()).toBe(0)

    // Leaving the page stops the poll. The navigation itself shows the indicator,
    // which proves the recorder above would have seen a poll's.
    await page.getByRole('link', { name: 'Customers', exact: true }).click()
    await expect(page).toHaveURL(/\/(customers|login)$/)
    await expect.poll(progressShown).toBeGreaterThan(0)
    const after = polls.length
    await page.waitForTimeout(4000)
    expect(polls.length).toBe(after)
  })
})
