export interface BackoffOptions {
  initial?: number | undefined
  max?: number | undefined
  factor?: number | undefined
  /** 0–1: fraction of jitter applied symmetrically. */
  jitter?: number | undefined
  random?: (() => number) | undefined
}

export class Backoff {
  private attempt = 0
  private readonly initial: number
  private readonly max: number
  private readonly factor: number
  private readonly jitter: number
  private readonly random: () => number

  constructor(options: BackoffOptions = {}) {
    this.initial = options.initial ?? 1000
    this.max = options.max ?? 30_000
    this.factor = options.factor ?? 2
    this.jitter = options.jitter ?? 0.3
    this.random = options.random ?? Math.random
  }

  get attempts(): number {
    return this.attempt
  }

  /** Next delay in ms; `base` overrides the initial delay (server `retry:`). */
  next(base?: number): number {
    const start = base ?? this.initial
    const raw = Math.min(this.max, start * Math.pow(this.factor, this.attempt))
    this.attempt++
    const spread = raw * this.jitter
    return Math.max(0, Math.round(raw - spread + this.random() * spread * 2))
  }

  reset(): void {
    this.attempt = 0
  }
}
