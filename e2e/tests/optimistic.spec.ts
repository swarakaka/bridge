import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'

/** Holds the browser's POST to `path` until the returned release() is called. */
async function hold(page: Page, path: string): Promise<() => void> {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() === 'POST') await gate
    await route.continue()
  })
  return release
}

test.describe('optimistic updates', () => {
  test('a star shows before the server answers and stays when it agrees', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/customers/2')
    await expect(page.getByTestId('star')).toHaveText('☆ Star')
    const release = await hold(page, '/customers/2/star')

    await page.getByTestId('star').click()
    await expect(page.getByTestId('star')).toHaveText('★ Starred')

    const answered = page.waitForResponse((r) => r.url().endsWith('/customers/2'))
    release()
    await answered
    await expect(page.getByTestId('star')).toHaveText('★ Starred')

    // Leave the seeded customer as it was.
    await page.unroute('**/customers/2/star')
    await page.getByTestId('star').click()
    await expect(page.getByTestId('star')).toHaveText('☆ Star')
  })

  test('a star on a locked customer is undone when the server refuses it', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/customers/1')
    const release = await hold(page, '/customers/1/star')

    await page.getByTestId('star').click()
    await expect(page.getByTestId('star')).toHaveText('★ Starred')

    const refused = page.waitForResponse((r) => r.url().endsWith('/customers/1/star'))
    release()
    expect((await refused).status()).toBe(422)
    await expect(page.getByTestId('star')).toHaveText('☆ Star')
    await expect(page.getByTestId('star-error')).toHaveText('Locked customers cannot be starred.')
  })
})
