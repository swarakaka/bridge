import { expect, test as base, type Page } from '@playwright/test'

export const test = base.extend<{ login: () => Promise<void> }>({
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
