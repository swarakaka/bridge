import { expect, test as base, type Page } from '@playwright/test'

export const test = base.extend<{ login: () => Promise<void> }>({
  // After a full navigation, wait for the client to hydrate: under SSR the markup is
  // interactive-looking before the Bridge app has mounted. A page that never hydrates
  // fails here instead of letting clicks fall through to full page loads.
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      if (response?.headers()['content-type']?.startsWith('text/html'))
        await page.locator('#app[data-bridge-hydrated]').waitFor({ timeout: 5000 })
      return response
    }

    // Server and client must render the same markup. Vue reports mismatches on the
    // console (production builds: "Hydration completed but contains mismatches.").
    const mismatches: string[] = []
    page.on('console', (message) => {
      if (/hydration/i.test(message.text()) && ['error', 'warning'].includes(message.type()))
        mismatches.push(`${page.url()}: ${message.text()}`)
    })

    await use(page)

    expect(mismatches, 'hydration mismatches').toEqual([])
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
