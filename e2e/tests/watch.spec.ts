import { expect, test } from '../fixtures/test'
import type { Browser, Page } from '@playwright/test'

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('ada@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('user-name')).toHaveText('Ada Lovelace')
}

async function secondBrowser(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page)
  return page
}

/** Creates a customer over JSON mode (no stream client identity) and returns its id. */
async function createCustomer(page: Page, name: string): Promise<number> {
  return page.evaluate(async (name) => {
    const token = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '')
    const response = await fetch('/customers', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': token,
      },
      body: JSON.stringify({ name, email: `${Date.now()}-${Math.random()}@watch.example.com` }),
    })
    return Number((response.headers.get('Location') ?? '').split('/').pop())
  }, name)
}

/** Partial reloads (X-Bridge-Only) a page sends from now on, as their key lists. */
function trackPartials(page: Page): string[][] {
  const partials: string[][] = []
  page.on('request', (request) => {
    const only = request.headers()['x-bridge-only']
    if (only) partials.push(only.split(','))
  })
  return partials
}

/** The stream delivers bus events within a poll interval (1 s in E2E); leave room for it. */
const STREAM_DELAY = 2500

test.describe('watched props', () => {
  test('a change reloads the record in other browsers, not in the tab that made it', async ({
    page,
    login,
    browser,
  }) => {
    await login()
    const id = await createCustomer(page, `Watched ${Date.now()}`)
    await page.goto(`/customers/${id}`)
    await expect(page.locator('html')).toHaveAttribute('data-bridge-stream', 'open')

    // The editor saves from a page that watches the record, so the stream message
    // can arrive while its own redirected page is still on the way.
    const editor = await secondBrowser(browser)
    await editor.goto(`/customers/${id}`)
    await expect(editor.locator('html')).toHaveAttribute('data-bridge-stream', 'open')
    const editorPartials = trackPartials(editor)
    const reload = page.waitForRequest((r) =>
      (r.headers()['x-bridge-only'] ?? '').split(',').includes('customer'),
    )

    await editor.getByTestId('star').click()
    await expect(editor.getByTestId('star')).toHaveText('★ Starred')

    // The viewer's `customer` prop watches this record and reloads.
    await reload
    await expect(page.getByTestId('star')).toHaveText('★ Starred')

    // The editor's redirect delivered the page after the save: no second reload.
    await editor.waitForTimeout(STREAM_DELAY)
    expect(editorPartials.filter((keys) => keys.includes('customer'))).toEqual([])
    await editor.context().close()
  })

  test('a change to another record reloads nothing', async ({ page, login, browser }) => {
    await login()
    const shown = await createCustomer(page, `Shown ${Date.now()}`)
    const changed = await createCustomer(page, `Changed ${Date.now()}`)
    await page.goto(`/customers/${shown}`)
    await expect(page.locator('html')).toHaveAttribute('data-bridge-stream', 'open')
    const partials = trackPartials(page)

    const editor = await secondBrowser(browser)
    await editor.goto(`/customers/${changed}/edit`)
    const renamed = `Elsewhere ${Date.now()}`
    await editor.getByLabel('name').fill(renamed)
    await editor.getByTestId('submit').click()
    await expect(editor.getByTestId('customer-name')).toHaveText(renamed)

    await page.waitForTimeout(STREAM_DELAY)
    expect(partials.filter((keys) => keys.includes('customer'))).toEqual([])
    await editor.context().close()
  })

  test('touching customers.* reloads every watcher except the tab that touched', async ({
    page,
    login,
    browser,
  }) => {
    await login()
    const id = await createCustomer(page, `Touched ${Date.now()}`)
    await page.goto('/realtime')
    await expect(page.getByTestId('stream-state')).toHaveText('open')
    const ownPartials = trackPartials(page)

    const viewer = await secondBrowser(browser)
    await viewer.goto(`/customers/${id}`)
    await expect(viewer.locator('html')).toHaveAttribute('data-bridge-stream', 'open')
    const reload = viewer.waitForRequest((r) =>
      (r.headers()['x-bridge-only'] ?? '').split(',').includes('customer'),
    )

    await page.getByTestId('touch-customers').click()
    await reload

    await page.waitForTimeout(STREAM_DELAY)
    expect(ownPartials.filter((keys) => keys.includes('customersCount'))).toEqual([])
    await viewer.context().close()
  })
})
