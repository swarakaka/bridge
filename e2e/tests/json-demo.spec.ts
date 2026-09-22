import { expect, test } from '../fixtures/test'

test.describe('JSON demo', () => {
  test('the same route answers JSON, page and HTML depending on Accept', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/json')

    await page.getByTestId('accept').selectOption('application/json')
    await page.getByTestId('run').click()
    await expect(page.getByTestId('result-status')).toHaveText('200')
    await expect(page.getByTestId('result-headers')).toContainText('content-type: application/json')
    await expect(page.getByTestId('result-body')).toContainText('"data": {')

    await page.getByTestId('accept').selectOption('application/vnd.bridge+json; v=1')
    await page.getByTestId('run').click()
    await expect(page.getByTestId('result-body')).toContainText('"component": "Customers/Index"')

    await page.getByTestId('accept').selectOption('text/html')
    await page.getByTestId('run').click()
    await expect(page.getByTestId('result-body')).toContainText('id="bridge-page"')

    await page.getByTestId('accept').selectOption('text/event-stream')
    await page.getByTestId('run').click()
    await expect(page.getByTestId('result-status')).toHaveText('406')
  })

  test('POST in JSON mode returns Laravel-native validation errors and 201 on success', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/json')
    await page.getByTestId('endpoint').selectOption({ index: 4 })
    await page.getByTestId('body').fill('{"name": ""}')
    await page.getByTestId('run').click()
    await expect(page.getByTestId('result-status')).toHaveText('422')
    await expect(page.getByTestId('result-body')).toContainText('"errors"')

    await page
      .getByTestId('body')
      .fill(`{"name": "Json Co", "email": "json-${Date.now()}@example.com"}`)
    await page.getByTestId('run').click()
    await expect(page.getByTestId('result-status')).toHaveText('201')
    await expect(page.getByTestId('result-headers')).toContainText('location')
  })
})
