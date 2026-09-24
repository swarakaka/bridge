/**
 * @swarakaka/bridge-core/server — the HTTP server the Laravel SSR gateway talks
 * to (PLAN §26). Framework adapters provide `render`
 * (`@swarakaka/bridge-vue/server`, `@swarakaka/bridge-react/server`).
 */
import { isPage, type BridgePage } from '@swarakaka/bridge-protocol'

export interface SsrRenderResult {
  head: string[]
  body: string
}

export interface SsrServerOptions {
  render: (page: BridgePage) => Promise<SsrRenderResult>
  port?: number | undefined
  host?: string | undefined
  /** Max request body in bytes (default 2 MB). */
  maxBody?: number | undefined
}

/**
 * A tiny HTTP server: POST /render with a page object → { head, body }.
 * GET /health → 200. Uses only node:http so the SSR bundle has no extra deps.
 */
export async function createSsrServer(
  options: SsrServerOptions,
): Promise<{ close(): Promise<void>; port: number }> {
  const { createServer } = await import('node:http')
  const maxBody = options.maxBody ?? 2 * 1024 * 1024
  const port =
    options.port ??
    Number(
      process.env.BRIDGE_SSR_PORT ??
        // `port` is '' (not nullish) when the URL has none.
        (new URL(process.env.BRIDGE_SSR_URL ?? 'http://127.0.0.1:13714').port || 13714),
    )
  const host = options.host ?? '127.0.0.1'

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
      return
    }
    if (req.method !== 'POST' || req.url !== '/render') {
      res.writeHead(404)
      res.end()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBody) {
        res.writeHead(413)
        res.end()
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      let page: unknown
      try {
        page = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end('{"message":"Invalid JSON"}')
        return
      }
      if (!isPage(page)) {
        res.writeHead(422, { 'Content-Type': 'application/json' })
        res.end('{"message":"Not a Bridge page object"}')
        return
      }
      options
        .render(page)
        .then((result) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })
        .catch((error: unknown) => {
          console.error('[bridge-ssr] render failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'Render failed' }))
        })
    })
  })

  await new Promise<void>((resolve) => server.listen(port, host, resolve))
  const address = server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port
  console.log(`[bridge-ssr] listening on http://${host}:${boundPort}`)
  return {
    port: boundPort,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}
