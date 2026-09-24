import { expect, test } from '../fixtures/test'

test.describe('once props', () => {
  test('the status list is sent once and reused on the next form', async ({ page, login }) => {
    await login()
    await page.goto('/customers')

    const create = page.waitForResponse((r) => new URL(r.url()).pathname === '/customers/create')
    await page.getByTestId('new-customer').click()
    const first = (await (await create).json()) as {
      props: Record<string, unknown>
      meta: { once: Record<string, { key: string }> }
    }
    expect(first.props.statuses).toEqual(['active', 'inactive'])
    expect(first.meta.once.statuses?.key).toBe('customer-statuses')
    await expect(page.getByLabel('Status').locator('option')).toHaveCount(2)

    // An unlocked customer's edit form uses the same once key. Navigate in the app:
    // a full document load starts with an empty store (the HTML shell carries every value).
    await page.getByRole('link', { name: 'Customers', exact: true }).click()
    await expect(page).toHaveURL(/\/customers$/)
    await page
      .getByTestId('customer-row')
      .filter({ hasNot: page.getByTitle('Locked') })
      .first()
      .getByRole('link')
      .click()
    await expect(page.getByTestId('customer-name')).toBeVisible()

    const editRequest = page.waitForRequest((r) => new URL(r.url()).pathname.endsWith('/edit'))
    const edit = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/edit'))
    await page.getByTestId('edit').click()
    expect((await editRequest).headers()['x-bridge-once']).toBe('customer-statuses')
    const second = (await (await edit).json()) as {
      props: Record<string, unknown>
      meta: { once: Record<string, { key: string }> }
    }
    expect(second.props).not.toHaveProperty('statuses')
    expect(second.meta.once.statuses?.key).toBe('customer-statuses')

    // The client filled the value in: the select still lists both statuses.
    await expect(page.getByLabel('Status').locator('option')).toHaveText(['active', 'inactive'])
  })
})
