/**
 * The identity a client sends as `X-Bridge-Client: <token>.<seq>` (spec/headers.md)
 * and the log that lets it recognise its own changes on a stream
 * (spec/stream.md §3.2, PLAN §20.6). The server echoes a hash of the token,
 * never the token, so other subscribers cannot pass for this client.
 */

/** Requests remembered for the own-change rule; older ones count as unknown. */
const LOG_SIZE = 100

interface LoggedRequest {
  started: number
  settled: number | null
}

export class ClientIdentity {
  /** 128 random bits, base64url without padding (22 characters). */
  readonly token: string
  /** base64url of the first 16 bytes of SHA-256 over the token: what servers publish. */
  readonly hash: string
  private seq = 0
  /** A logical clock ordering request starts and settles. */
  private clock = 0
  private readonly log = new Map<number, LoggedRequest>()

  constructor(token: string = randomToken()) {
    this.token = token
    this.hash = base64url(sha256(ascii(token)).subarray(0, 16))
  }

  /** Numbers a new request and returns its `X-Bridge-Client` value. */
  begin(): { seq: number; header: string } {
    const seq = ++this.seq
    this.log.set(seq, { started: ++this.clock, settled: null })
    if (this.log.size > LOG_SIZE) this.log.delete(this.log.keys().next().value!)
    return { seq, header: `${this.token}.${seq}` }
  }

  /** The response of `seq` arrived (or the request failed or was aborted). */
  settle(seq: number): void {
    const entry = this.log.get(seq)
    if (entry && entry.settled === null) entry.settled = ++this.clock
  }

  /** The request number of a stream `client` member when it names this client, else null. */
  own(client: string): number | null {
    const dot = client.lastIndexOf('.')
    if (dot < 0 || client.slice(0, dot) !== this.hash) return null
    const seq = Number(client.slice(dot + 1))
    return Number.isSafeInteger(seq) && seq > 0 ? seq : null
  }

  known(seq: number): boolean {
    return this.log.has(seq)
  }

  settled(seq: number): boolean {
    const entry = this.log.get(seq)
    return entry !== undefined && entry.settled !== null
  }

  /** Whether request `later` started after request `earlier` settled. Unknown requests: false. */
  startedAfterSettled(later: number, earlier: number): boolean {
    const a = this.log.get(later)
    const b = this.log.get(earlier)
    return a !== undefined && b !== undefined && b.settled !== null && a.started > b.settled
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return base64url(bytes)
}

function ascii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff
  return bytes
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** base64url without padding. */
export function base64url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!
    if (i + 2 < bytes.length) out += B64[n & 63]!
  }
  return out
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/**
 * SHA-256 (FIPS 180-4). Synchronous and dependency-free: Web Crypto is
 * asynchronous and missing outside secure contexts, and the hash is needed
 * before the first stream message is handled.
 */
export function sha256(message: Uint8Array): Uint8Array {
  const length = message.length
  const blocks = Math.ceil((length + 9) / 64)
  const data = new Uint8Array(blocks * 64)
  data.set(message)
  data[length] = 0x80
  const view = new DataView(data.buffer)
  view.setUint32(data.length - 8, Math.floor(length / 0x20000000))
  view.setUint32(data.length - 4, (length << 3) >>> 0)

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))

  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    for (let i = 0; i < 64; i++) {
      const t1 =
        (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0]! + a) >>> 0
    h[1] = (h[1]! + b) >>> 0
    h[2] = (h[2]! + c) >>> 0
    h[3] = (h[3]! + d) >>> 0
    h[4] = (h[4]! + e) >>> 0
    h[5] = (h[5]! + f) >>> 0
    h[6] = (h[6]! + g) >>> 0
    h[7] = (h[7]! + hh) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!)
  return out
}
