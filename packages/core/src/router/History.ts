import type { BridgePage } from '@swarakaka/bridge-protocol'
import { HistoryCipher, type SealedEntry } from './HistoryCipher.js'

export interface HistoryState {
  bridge: true
  page: BridgePage
  key: number
  scroll: ScrollPositions
  remember: Record<string, unknown>
}

/**
 * What `history.state` holds. A page marked `meta.encryptHistory` is kept in
 * `sealed` (page and remembered state encrypted) or, without Web Crypto, left
 * out; `scroll` and the ids stay in clear (spec/page.md §10).
 */
export interface StoredHistoryState {
  bridge: true
  key: number
  scroll: ScrollPositions
  /** Identifies the entry, so writes and decrypted copies never land on another one. */
  entry?: string | undefined
  page?: BridgePage | undefined
  remember?: Record<string, unknown> | undefined
  sealed?: SealedEntry | undefined
}

export type ScrollPositions = { window: [number, number]; regions: Array<[number, number]> }

export interface HistoryOptions {
  window?: Window | undefined
}

/**
 * Wraps the History API: each page swap stores the page object, scroll
 * positions and remembered component state so back/forward restore without a request.
 *
 * Encrypted entries (PLAN §23.1) are written in two steps because Web Crypto
 * is asynchronous: the entry is pushed at once without its page, then replaced
 * by the sealed state. The decrypted state of the current entry is kept in
 * memory so reads (`current`, `restore`) stay synchronous.
 */
export class History {
  private readonly win: Window | null
  private readonly cipher: HistoryCipher | null
  private popListener: ((state: StoredHistoryState | null, event: PopStateEvent) => void) | null =
    null
  /** The current entry's state in clear, when it is sealed or its seal is pending. */
  private memory: { entry: string; state: HistoryState } | null = null
  private readonly prefix = Math.random().toString(36).slice(2, 10)
  private entries = 0
  /** Latest write; an older seal finishing late must not overwrite it. */
  private writes = 0
  private warned = false
  private readonly onPop = (event: PopStateEvent): void => {
    const state = isStoredHistoryState(event.state) ? event.state : null
    this.popListener?.(state, event)
  }

  constructor(options: HistoryOptions = {}) {
    this.win = options.window ?? (typeof window === 'undefined' ? null : window)
    this.cipher = this.win ? new HistoryCipher(this.win) : null
  }

  listen(listener: (state: StoredHistoryState | null, event: PopStateEvent) => void): () => void {
    this.popListener = listener
    this.win?.addEventListener('popstate', this.onPop)
    return () => {
      this.popListener = null
      this.win?.removeEventListener('popstate', this.onPop)
    }
  }

  current(): HistoryState | null {
    const stored = this.stored()
    if (!stored) return null
    if (this.memory && stored.entry !== undefined && stored.entry === this.memory.entry)
      return this.memory.state
    return stored.page ? { ...stored, page: stored.page, remember: stored.remember ?? {} } : null
  }

  /**
   * The popped entry in clear: synchronous for plain entries, a promise for
   * sealed ones. `page` is missing (null) when it cannot be read, and the
   * caller requests the URL again.
   */
  open(stored: StoredHistoryState): HistoryState | null | Promise<HistoryState | null> {
    if (!stored.sealed) {
      return stored.page ? { ...stored, page: stored.page, remember: stored.remember ?? {} } : null
    }
    const sealed = stored.sealed
    return (this.cipher?.open(sealed) ?? Promise.resolve(null)).then((value) => {
      const content = value as Pick<HistoryState, 'page' | 'remember'> | null
      if (!content || typeof content !== 'object' || !content.page) return null
      const { sealed: _, ...rest } = stored
      const state: HistoryState = {
        ...rest,
        bridge: true,
        page: content.page,
        remember: content.remember ?? {},
      }
      // Remember the clear copy only while that entry is still the current one.
      const now = this.stored()
      if (stored.entry !== undefined && now?.entry === stored.entry)
        this.memory = { entry: stored.entry, state }
      return state
    })
  }

  push(page: BridgePage, key: number, replace = false): void {
    if (!this.win) return
    const scroll: ScrollPositions = { window: [0, 0], regions: [] }
    const remember = replace ? (this.current()?.remember ?? {}) : {}
    this.write(
      { bridge: true, page, key, scroll, remember },
      replace ? 'replace' : 'push',
      page.url,
    )
  }

  /** Updates the stored page (e.g. after a partial reload) without a new entry. */
  updatePage(page: BridgePage): void {
    const state = this.current()
    if (!state || !this.win) return
    this.write({ ...state, page }, 'update', page.url)
  }

  saveScroll(scroll: ScrollPositions): void {
    const stored = this.stored()
    if (!stored || !this.win) return
    // Scroll positions are never sealed, so this write needs no encryption.
    this.win.history.replaceState({ ...stored, scroll }, '', this.win.location.href)
    if (this.memory && this.memory.entry === stored.entry)
      this.memory = { ...this.memory, state: { ...this.memory.state, scroll } }
  }

  remember(key: string, value: unknown): void {
    const state = this.current()
    if (!state || !this.win) return
    this.write(
      { ...state, remember: { ...state.remember, [key]: value } },
      'update',
      this.win.location.href,
    )
  }

  restore<T>(key: string): T | undefined {
    return this.current()?.remember[key] as T | undefined
  }

  back(): void {
    this.win?.history.back()
  }

  /**
   * Makes every entry encrypted so far unreadable, in this tab and (through
   * the shared epoch) in the origin's other tabs (spec/page.md §10).
   */
  clear(): void {
    this.cipher?.rotate()
    const stored = this.stored()
    if (this.memory && stored?.entry !== this.memory.entry) this.memory = null
  }

  /** True when this document sealed with a key that was replaced since (bfcache restores). */
  keyReplaced(): boolean {
    return this.cipher?.replaced() ?? false
  }

  private write(state: HistoryState, mode: 'push' | 'replace' | 'update', url: string): void {
    const win = this.win!
    const seal = state.page.meta?.encryptHistory === true
    // A push or a replaced page is a new entry; an update keeps the entry's id.
    const entry =
      mode === 'update' && this.stored()?.entry !== undefined
        ? this.stored()!.entry!
        : `${this.prefix}.${++this.entries}`
    const write = ++this.writes

    if (!seal) {
      this.memory = null
      const stored: StoredHistoryState = { ...state, entry }
      if (mode === 'push') win.history.pushState(stored, '', url)
      else win.history.replaceState(stored, '', url)
      return
    }

    const { page: _page, remember: _remember, ...clear } = state
    const placeholder: StoredHistoryState = { ...clear, entry }
    this.memory = { entry, state }
    if (mode === 'push') win.history.pushState(placeholder, '', url)
    else if (mode === 'replace') win.history.replaceState(placeholder, '', url)

    // An update leaves the entry's previous seal in place until the new one lands;
    // reads meanwhile come from memory. The address changes now: a later write
    // (remember) supersedes this seal and reads the address it should keep.
    if (mode === 'update' && url !== win.location.href)
      win.history.replaceState(win.history.state, '', url)
    if (!this.cipher?.available()) {
      this.warnUnavailable()
      if (mode === 'update') win.history.replaceState(placeholder, '', url)
      return
    }

    void this.cipher
      .seal({ page: state.page, remember: state.remember })
      .catch(() => null)
      .then((sealed) => {
        const now = this.stored()
        // Superseded by a later write, or the user left the entry meanwhile.
        if (write !== this.writes || now?.entry !== entry) return
        // Keep scroll positions saved while the seal was running; never keep a page in clear.
        const { page: _p, remember: _r, sealed: _s, ...rest } = now
        if (!sealed) this.warnUnavailable()
        win.history.replaceState(sealed ? { ...rest, sealed } : rest, '', url)
      })
  }

  private stored(): StoredHistoryState | null {
    const state = this.win?.history.state
    return isStoredHistoryState(state) ? state : null
  }

  private warnUnavailable(): void {
    if (this.warned) return
    this.warned = true
    console.warn(
      '[bridge] history encryption needs Web Crypto (HTTPS or localhost) and sessionStorage; encrypted pages are kept out of history and requested again on back/forward.',
    )
  }
}

export function isHistoryState(value: unknown): value is HistoryState {
  return isStoredHistoryState(value) && 'page' in value && value.page !== undefined
}

export function isStoredHistoryState(value: unknown): value is StoredHistoryState {
  return typeof value === 'object' && value !== null && (value as HistoryState).bridge === true
}
