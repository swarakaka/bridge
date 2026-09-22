import { expect, test as base, type Page } from '@playwright/test'

export const test = base.extend<{ login: () => Promise<void> }>({
  // After a full navigation, wait for the client to hydrate: under SSR the markup is
  // interactive-looking before the Bridge app has mounted.
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await page
        .locator('#app[data-bridge-hydrated]')
        .waitFor({ timeout: 5000 })
        .catch(() => undefined)
      return response
    }
    await use(page)
  },
  login: async ({ page }, use) => {
    await use(async () => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('ada@example.com')
      await page.getByLabel('Password').fill('password')
      await page.getByTestId('submit').click()
      await expect(page.getByTestId('user-name')).toHaveText('Ada Lovelace')
    })
  },
})

export { expect }

/** Counts Bridge page requests (Accept: application/vnd.bridge+json) made from now on. */
export function trackPageRequests(page: Page): { count: () => number; urls: () => string[] } {
  const urls: string[] = []
  page.on('request', (request) => {
    if ((request.headers()['accept'] ?? '').startsWith('application/vnd.bridge+json'))
      urls.push(request.url())
  })
  return { count: () => urls.length, urls: () => urls }
}
