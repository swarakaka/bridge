/** A sealed history payload (spec/page.md §10). Stored in `history.state`. */
export interface SealedEntry {
  v: 1
  /** Id of the key that sealed it; a replaced key cannot open it. */
  kid: string
  iv: Uint8Array<ArrayBuffer>
  data: ArrayBuffer
}

interface KeyRecord {
  kid: string
  key: string
  epoch: string
}

const KEY_STORAGE = 'bridge.history.key'
/** Shared by every tab of the origin: bumped by a clear so other tabs replace their keys too. */
export const EPOCH_STORAGE = 'bridge.history.epoch'

/**
 * AES-GCM encryption for history entries (PLAN §23.1). The raw key lives in
 * `sessionStorage`, so it never sits in the history entry and ends with the
 * tab's session; a clear replaces it, which makes every older entry unreadable.
 */
export class HistoryCipher {
  private readonly win: Window
  private cached: { kid: string; epoch: string; key: Promise<CryptoKey> } | null = null

  constructor(win: Window) {
    this.win = win
  }

  /** Web Crypto needs a secure context (HTTPS or localhost); storage may be blocked. */
  available(): boolean {
    return this.subtle() !== null && this.session() !== null
  }

  async seal(value: unknown): Promise<SealedEntry | null> {
    const subtle = this.subtle()
    const current = subtle ? this.currentKey(true) : null
    if (!subtle || !current) return null
    const iv = this.win.crypto.getRandomValues(new Uint8Array(12))
    const plain = new TextEncoder().encode(JSON.stringify(value))
    const data = await subtle.encrypt({ name: 'AES-GCM', iv }, await current.key, plain)
    return { v: 1, kid: current.kid, iv, data }
  }

  /** The sealed value, or null when the key is gone, was replaced, or the data does not authenticate. */
  async open(sealed: SealedEntry): Promise<unknown> {
    const subtle = this.subtle()
    const current = subtle ? this.currentKey(false) : null
    if (!subtle || !current || current.kid !== sealed.kid) return null
    try {
      const plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: sealed.iv },
        await current.key,
        sealed.data,
      )
      return JSON.parse(new TextDecoder().decode(plain)) as unknown
    } catch {
      return null
    }
  }

  /** Drops the key and tells the origin's other tabs to drop theirs. */
  rotate(): void {
    this.cached = null
    try {
      this.session()?.removeItem(KEY_STORAGE)
    } catch {
      // Storage refused: the in-memory key is gone anyway.
    }
    const local = this.local()
    if (!local) return
    try {
      local.setItem(EPOCH_STORAGE, String(Number(local.getItem(EPOCH_STORAGE) ?? '0') + 1))
    } catch {
      // Quota or privacy mode: other tabs keep their keys until their own clear.
    }
  }

  /**
   * True when this document sealed with a key that is no longer the tab's
   * current one (replaced by another document, or by a clear in another tab).
   */
  replaced(): boolean {
    if (!this.cached) return false
    const record = this.readRecord()
    return record === null || record.kid !== this.cached.kid || record.epoch !== this.epoch()
  }

  private currentKey(create: boolean): { kid: string; key: Promise<CryptoKey> } | null {
    const epoch = this.epoch()
    let record = this.readRecord()
    if (record && record.epoch !== epoch) {
      // Another tab cleared history: this tab's key must not open anything any more.
      this.rotateLocal()
      record = null
    }
    if (this.cached && record && this.cached.kid === record.kid && this.cached.epoch === epoch)
      return this.cached
    if (!record) {
      if (!create) return null
      record = this.createRecord(epoch)
      if (!record) return null
    }
    const raw = base64ToBytes(record.key)
    const key = this.subtle()!.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    this.cached = { kid: record.kid, epoch, key }
    return this.cached
  }

  private createRecord(epoch: string): KeyRecord | null {
    const bytes = this.win.crypto.getRandomValues(new Uint8Array(32))
    const kid = bytesToBase64(this.win.crypto.getRandomValues(new Uint8Array(9)))
    const record: KeyRecord = { kid, key: bytesToBase64(bytes), epoch }
    try {
      this.session()?.setItem(KEY_STORAGE, JSON.stringify(record))
    } catch {
      return null
    }
    return record
  }

  private rotateLocal(): void {
    this.cached = null
    try {
      this.session()?.removeItem(KEY_STORAGE)
    } catch {
      // Ignored: see rotate().
    }
  }

  private readRecord(): KeyRecord | null {
    try {
      const raw = this.session()?.getItem(KEY_STORAGE)
      if (!raw) return null
      const record = JSON.parse(raw) as Partial<KeyRecord>
      return typeof record.kid === 'string' &&
        typeof record.key === 'string' &&
        typeof record.epoch === 'string'
        ? (record as KeyRecord)
        : null
    } catch {
      return null
    }
  }

  private epoch(): string {
    try {
      return this.local()?.getItem(EPOCH_STORAGE) ?? '0'
    } catch {
      return '0'
    }
  }

  private subtle(): SubtleCrypto | null {
    return this.win.crypto?.subtle ?? null
  }

  private session(): Storage | null {
    try {
      return this.win.sessionStorage
    } catch {
      return null
    }
  }

  private local(): Storage | null {
    try {
      return this.win.localStorage
    } catch {
      return null
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
