import { expect, test } from '../fixtures/test'

test.describe('infinite scroll', () => {
  test('loads pages while scrolling down, and earlier pages above when opened on a later page', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/customers')
    const rows = page.getByTestId('customer-row')
    const after = page.locator('[data-bridge-scroll-edge="after"]')
    await expect(rows).toHaveCount(20)

    await after.scrollIntoViewIfNeeded()
    await expect(rows).toHaveCount(40)
    await after.scrollIntoViewIfNeeded()
    await expect(page).toHaveURL(/\/customers\?page=3$/)
    const threePages = await rows.count()
    expect(threePages).toBeGreaterThan(40)
    // Manual buttons are only the fallback: an observing list shows none.
    await expect(page.getByTestId('load-more')).toHaveCount(0)

    // Open the address directly (as a reload or a shared link would): the list starts at
    // page 3 and the top edge loads page 2 above it. The rows the user sees stay in place:
    // the page scrolls down by the inserted height instead of pushing them out of view.
    await page.goto('/customers?page=3')
    // The first row of page 3, as the server embedded it (page 2 may already be above it).
    const name = await page.evaluate(
      () =>
        (
          JSON.parse(document.getElementById('bridge-page')!.textContent!) as {
            props: { customers: { data: Array<{ name: string }> } }
          }
        ).props.customers.data[0]!.name,
    )
    // Pages 3 and 2: page 1 stays unloaded, its edge is out of view once the viewport is kept still.
    await expect(rows).toHaveCount(threePages - 20)
    await expect(page).toHaveURL(/\/customers\?page=2$/)

    const box = await rows.filter({ hasText: name }).first().boundingBox()
    const viewport = page.viewportSize()!
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(viewport.height)
  })

  test('a search replaces the loaded pages and starts over', async ({ page, login }) => {
    await login()
    await page.goto('/customers')
    await page.locator('[data-bridge-scroll-edge="after"]').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('customer-row')).toHaveCount(40)

    await page.getByTestId('search').fill('Acme')
    await expect(page.getByTestId('loaded-count')).toHaveText(/^(\d+) of \1 shown\s*$/)
    expect(await page.getByTestId('customer-row').count()).toBeLessThan(20)
  })
})
