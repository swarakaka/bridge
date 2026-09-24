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

  test('useJson calls the same routes from the client and maps errors', async ({ page, login }) => {
    await login()
    await page.goto('/json')

    await page.getByTestId('endpoint').selectOption({ index: 4 })
    await page.getByTestId('body').fill('{"name": ""}')
    await page.getByTestId('run-json').click()
    await expect(page.getByTestId('json-status')).toHaveText('422')
    await expect(page.getByTestId('json-body')).toContainText('"email"')
    await expect(page.getByTestId('json-message')).toBeVisible()

    await page
      .getByTestId('body')
      .fill(`{"name": "UseJson Co", "email": "usejson-${Date.now()}@example.com"}`)
    await page.getByTestId('run-json').click()
    await expect(page.getByTestId('json-status')).toHaveText('201')
    await expect(page.getByTestId('json-location')).toContainText('/customers/')
    await expect(page.getByTestId('json-body')).toContainText('"customer"')
    await expect(page.getByTestId('json-message')).toHaveCount(0)

    await page.getByTestId('endpoint').selectOption({ index: 5 })
    await page.getByTestId('run-json').click()
    await expect(page.getByTestId('json-status')).toHaveText('404')
    await expect(page.getByTestId('json-body')).toContainText('"not_found"')
  })

  test('useJsonForm creates a customer in JSON mode with live validation', async ({
    page,
    login,
  }) => {
    await login()
    await page.goto('/json')
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/customers') && request.method() === 'POST')
        requests.push(request.headers()['accept'] ?? '')
    })

    // Precognition over JSON on blur: a 422 for that field only.
    await page.getByTestId('json-form-email').fill('not-an-email')
    await page.getByTestId('json-form-email').blur()
    await expect(page.getByTestId('json-form-error-email')).toBeVisible()
    await expect(page.getByTestId('json-form-error-name')).toHaveCount(0)

    // Submitting with a missing name: a 422 in JSON mode fills the field errors.
    await page.getByTestId('json-form-submit').click()
    await expect(page.getByTestId('json-form-error-name')).toBeVisible()

    // A valid email clears its error on blur (204).
    await page.getByTestId('json-form-email').fill(`jsonform-${Date.now()}@example.com`)
    await page.getByTestId('json-form-email').blur()
    await expect(page.getByTestId('json-form-error-email')).toHaveCount(0)

    await page.getByTestId('json-form-name').fill('JsonForm Co')
    await page.getByTestId('json-form-submit').click()
    await expect(page.getByTestId('json-form-created')).toContainText('HTTP 201')
    await expect(page.getByTestId('json-form-created')).toContainText('JsonForm Co')
    await expect(page.getByTestId('json-form-created')).toContainText('/customers/')
    await expect(page.getByTestId('json-form-name')).toHaveValue('')
    await expect(page).toHaveURL(/\/json$/)
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every((accept) => accept === 'application/json')).toBe(true)
  })
})
