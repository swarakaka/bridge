import type { BridgePage } from '@swarakaka/bridge-protocol'

export interface HistoryState {
  bridge: true
  page: BridgePage
  key: number
  scroll: ScrollPositions
  remember: Record<string, unknown>
}

export type ScrollPositions = { window: [number, number]; regions: Array<[number, number]> }

export interface HistoryOptions {
  window?: Window | undefined
}

/**
 * Wraps the History API: each page swap stores the page object, scroll
 * positions and remembered component state so back/forward restore without a request.
 */
export class History {
  private readonly win: Window | null
  private popListener: ((state: HistoryState | null, event: PopStateEvent) => void) | null = null
  private readonly onPop = (event: PopStateEvent): void => {
    const state = isHistoryState(event.state) ? event.state : null
    this.popListener?.(state, event)
  }

  constructor(options: HistoryOptions = {}) {
    this.win = options.window ?? (typeof window === 'undefined' ? null : window)
  }

  listen(listener: (state: HistoryState | null, event: PopStateEvent) => void): () => void {
    this.popListener = listener
    this.win?.addEventListener('popstate', this.onPop)
    return () => {
      this.popListener = null
      this.win?.removeEventListener('popstate', this.onPop)
    }
  }

  current(): HistoryState | null {
    const state = this.win?.history.state
    return isHistoryState(state) ? state : null
  }

  push(page: BridgePage, key: number, replace = false): void {
    if (!this.win) return
    const state: HistoryState = {
      bridge: true,
      page,
      key,
      scroll: { window: [0, 0], regions: [] },
      remember: replace ? (this.current()?.remember ?? {}) : {},
    }
    const url = page.url
    if (replace) this.win.history.replaceState(state, '', url)
    else this.win.history.pushState(state, '', url)
  }

  /** Updates the stored page (e.g. after a partial reload) without a new entry. */
  updatePage(page: BridgePage): void {
    const state = this.current()
    if (!state || !this.win) return
    this.win.history.replaceState({ ...state, page }, '', page.url)
  }

  saveScroll(scroll: ScrollPositions): void {
    const state = this.current()
    if (!state || !this.win) return
    this.win.history.replaceState({ ...state, scroll }, '', this.win.location.href)
  }

  remember(key: string, value: unknown): void {
    const state = this.current()
    if (!state || !this.win) return
    this.win.history.replaceState(
      { ...state, remember: { ...state.remember, [key]: value } },
      '',
      this.win.location.href,
    )
  }

  restore<T>(key: string): T | undefined {
    return this.current()?.remember[key] as T | undefined
  }

  back(): void {
    this.win?.history.back()
  }
}

export function isHistoryState(value: unknown): value is HistoryState {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as HistoryState).bridge === true &&
    'page' in value
  )
}
