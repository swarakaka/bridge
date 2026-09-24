import { expect, test } from '../fixtures/test'

/**
 * Raw protocol checks over real HTTP with Node's fetch (no browser): framing,
 * ready/heartbeat/end, Last-Event-ID replay, negotiation, tickets.
 */

interface Frame {
  event?: string
  data?: unknown
  id?: string
  retry?: string
  comment?: string
}

function parse(text: string): Frame[] {
  return text
    .split('\n\n')
    .filter((b) => b.trim() !== '')
    .map((block) => {
      const frame: Frame = {}
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) {
          frame.comment = line.slice(1).trim()
          continue
        }
        const i = line.indexOf(':')
        const field = i === -1 ? line : line.slice(0, i)
        const value = i === -1 ? '' : line.slice(i + 1).trim()
        if (field === 'data') {
          try {
            frame.data = JSON.parse(value)
          } catch {
            frame.data = value
          }
        } else if (field === 'event' || field === 'id' || field === 'retry') frame[field] = value
      }
      return frame
    })
}

async function readStream(
  response: Response,
  ms: number,
  onText?: (text: string) => void,
): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const race = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), Math.max(1, deadline - Date.now()))),
    ])
    if (race === null) break
    if (race.done) break
    text += decoder.decode(race.value, { stream: true })
    onText?.(text)
  }
  await reader.cancel().catch(() => undefined)
  return text
}

test.describe('stream protocol', () => {
  let token = ''
  let base = ''

  test.beforeAll(async ({ browser, baseURL }) => {
    base = baseURL!
    const page = await (await browser.newContext({ baseURL: base })).newPage()
    await page.goto('/login')
    await page.getByLabel('Email').fill('ada@example.com')
    await page.getByLabel('Password').fill('password')
    await page.getByTestId('submit').click()
    await expect(page.getByTestId('user-name')).toHaveText('Ada Lovelace')
    await page.goto('/tokens')
    await page.getByTestId('token-form').locator('input').fill('protocol-spec')
    await page.getByTestId('token-form').getByRole('button').click()
    token = (await page.getByTestId('plain-token').locator('code').textContent())!.trim()
    await page.close()
  })

  test('negotiates only text/event-stream and answers JSON 401 before establishment', async () => {
    const json = await fetch(`${base}/events`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    expect(json.status).toBe(406)
    const guest = await fetch(`${base}/events`, { headers: { Accept: 'text/event-stream' } })
    expect(guest.status).toBe(401)
    expect(guest.headers.get('content-type')).toContain('application/json')
  })

  test('frames ready, heartbeats, ids and end with the documented headers', async () => {
    const response = await fetch(`${base}/events`, {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.get('cache-control')).toContain('no-cache')
    expect(response.headers.get('x-accel-buffering')).toBe('no')

    // Publish while connected, using the bearer token against the same routes. The
    // subscription is live only after `ready`, so wait for it instead of a fixed delay.
    let published = false
    const publishOnReady = (text: string): void => {
      if (published || !text.includes('"type":"ready"')) return
      published = true
      void fetch(`${base}/realtime/notify`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'via protocol test', level: 'info' }),
      })
    }

    const frames = parse(await readStream(response, 10_000, publishOnReady))
    expect(frames[0]).toEqual({ retry: '3000' })
    expect(frames[1]!.data).toMatchObject({
      type: 'ready',
      protocol: 1,
      replayed: false,
      heartbeat: 2000,
      maxDuration: 8000,
    })
    expect(frames.some((f) => f.comment === 'hb')).toBe(true)
    const note = frames.find(
      (f) => (f.data as { message?: string })?.message === 'via protocol test',
    )
    expect(note?.id).toMatch(/^\d+$/)
    expect(frames.at(-1)!.data).toEqual({ type: 'end', reason: 'max_duration', reconnect: true })
  })

  test('replays after Last-Event-ID', async () => {
    await fetch(`${base}/realtime/notify`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'replay me', level: 'info' }),
    })
    const response = await fetch(`${base}/events`, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
        'Last-Event-ID': '0',
      },
    })
    const text = await readStream(response, 3000)
    const frames = parse(text)
    expect(frames[1]!.data).toMatchObject({ type: 'ready', replayed: true })
    const summary = `${frames.length} frames; last: ${JSON.stringify(frames.slice(-2))}`
    expect(
      frames.some((f) => (f.data as { message?: string })?.message === 'replay me'),
      summary,
    ).toBe(true)
  })

  test('signed tickets open the stream without headers and refuse tampering', async () => {
    const ticket = await fetch(`${base}/realtime/ticket`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    const { url } = (await ticket.json()) as { url: string }
    expect(url).toContain('/events/ticket?')

    const ok = await fetch(url, { headers: { Accept: 'text/event-stream' } })
    expect(ok.status).toBe(200)
    await ok.body?.cancel()

    const bad = await fetch(url.replace('bridge_user=', 'bridge_user=9'), {
      headers: { Accept: 'text/event-stream' },
    })
    expect(bad.status).toBe(401)
  })

  test('a native EventSource reconnect: lastEventId in the ticket URL, and a JSON probe for refusals', async () => {
    const post = (path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    await post('/realtime/notify', { message: 'resume me', level: 'info' })
    const { url } = (await (await post('/realtime/ticket')).json()) as { url: string }

    // No headers at all, as a new EventSource would connect; the ticket signature still holds.
    const resumed = await fetch(`${url}&lastEventId=0`, {
      headers: { Accept: 'text/event-stream' },
    })
    expect(resumed.status).toBe(200)
    const frames = parse(await readStream(resumed, 3000))
    expect(frames[1]!.data).toMatchObject({ type: 'ready', replayed: true })
    expect(frames.some((f) => (f.data as { message?: string })?.message === 'resume me')).toBe(true)

    // The client's refusal probe: allowed → 406 without opening a stream; refused → 401.
    const allowed = await fetch(url, { headers: { Accept: 'application/json' } })
    expect(allowed.status).toBe(406)
    const refused = await fetch(url.replace('bridge_user=', 'bridge_user=9'), {
      headers: { Accept: 'application/json' },
    })
    expect(refused.status).toBe(401)
  })
})
