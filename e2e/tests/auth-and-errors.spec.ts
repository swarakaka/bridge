import { expect, test } from '../fixtures/test'

test.describe('authentication', () => {
  test('guests are sent to the login page and back after signing in', async ({ page }) => {
    await page.goto('/customers')
    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('Password').fill('password')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL(/\/customers$/)
    await expect(page.getByTestId('user-name')).toHaveText('Ada Lovelace')
  })

  test('wrong credentials show a validation error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Password').fill('nope')
    await page.getByTestId('submit').click()
    await expect(page.getByTestId('error-email')).toContainText('do not match')
    // <BridgeForm reset-on-error="['password']">: the password is cleared, the email kept.
    await expect(page.getByLabel('Password')).toHaveValue('')
    await expect(page.getByLabel('Email')).toHaveValue('ada@example.com')
  })

  test('an unauthenticated page request navigates to login in-app', async ({ page }) => {
    await page.goto('/errors')
    await page.getByTestId('trigger-401').click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('sign out returns to the dashboard as a guest', async ({ page, login }) => {
    await login()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('bearer tokens issued on the Tokens page work in the JSON demo', async ({ page, login }) => {
    await login()
    await page.goto('/tokens')
    await page.getByTestId('token-form').getByRole('button').click()
    const token =
      (await page.getByTestId('plain-token').locator('code').textContent())?.trim() ?? ''
    expect(token).toMatch(/^\d+\|/)

    await page.goto('/json')
    await page.getByTestId('token').fill(token)
    await page.getByTestId('run').click()
    await expect(page.getByTestId('result-status')).toHaveText('200')
    await expect(page.getByTestId('result-body')).toContainText('"customers"')
  })
})

test.describe('errors', () => {
  test('403 for a locked customer renders the error page in place', async ({ page, login }) => {
    await login()
    await page.goto('/customers/1')
    await expect(page.getByTestId('locked')).toBeVisible()
    await page.getByTestId('edit').click()
    await expect(page.getByTestId('error-page')).toHaveAttribute('data-status', '403')
    await expect(page.getByTestId('error-message')).toContainText('unauthorized')
    // History was not changed by the error.
    await expect(page).toHaveURL(/\/customers\/1$/)
  })

  test('404 and 500 render the error page with safe messages', async ({ page, login }) => {
    await login()
    await page.goto('/errors')
    await page.getByTestId('trigger-404').click()
    await expect(page.getByTestId('error-page')).toHaveAttribute('data-status', '404')

    await page.getByRole('link', { name: 'Back to the dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await page.goto('/errors')
    await page.getByTestId('trigger-500').click()
    await expect(page.getByTestId('error-page')).toHaveAttribute('data-status', '500')
    await expect(page.getByTestId('error-message')).toHaveText('Server Error.')
  })
})
