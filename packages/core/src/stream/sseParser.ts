/**
 * Incremental text/event-stream parser (WHATWG). Feed chunks; receive events
 * and comments. Handles CRLF, LF and chunk boundaries inside lines.
 */
export interface SseEvent {
  event: string
  data: string
  id: string | null
  retry: number | null
}

export interface SseParserHandlers {
  onEvent(event: SseEvent): void
  onComment?(comment: string): void
  onRetry?(ms: number): void
}

export class SseParser {
  private buffer = ''
  private eventName = ''
  private dataLines: string[] = []
  private id: string | null = null
  private lastId: string | null = null
  private retry: number | null = null

  constructor(private readonly handlers: SseParserHandlers) {}

  get lastEventId(): string | null {
    return this.lastId
  }

  feed(chunk: string): void {
    this.buffer += chunk
    let index: number
    while ((index = this.findLineEnd()) !== -1) {
      const line = this.buffer.slice(0, index)
      const skip = this.buffer[index] === '\r' && this.buffer[index + 1] === '\n' ? 2 : 1
      this.buffer = this.buffer.slice(index + skip)
      this.processLine(line)
    }
  }

  /** Flush a trailing event with no terminating blank line (stream closed). */
  end(): void {
    if (this.buffer !== '') {
      const line = this.buffer
      this.buffer = ''
      this.processLine(line)
    }
    this.dispatch()
  }

  private findLineEnd(): number {
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i]
      if (c === '\n') return i
      if (c === '\r') {
        // A CR at the very end may be followed by LF in the next chunk; wait.
        if (i === this.buffer.length - 1) return -1
        return i
      }
    }
    return -1
  }

  private processLine(line: string): void {
    if (line === '') {
      this.dispatch()
      return
    }
    if (line.startsWith(':')) {
      this.handlers.onComment?.(line.slice(1).replace(/^ /, ''))
      return
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    switch (field) {
      case 'event':
        this.eventName = value
        break
      case 'data':
        this.dataLines.push(value)
        break
      case 'id':
        if (!value.includes('\0')) this.id = value
        break
      case 'retry':
        if (/^\d+$/.test(value)) {
          this.retry = Number(value)
          this.handlers.onRetry?.(this.retry)
        }
        break
      default:
        break
    }
  }

  private dispatch(): void {
    if (this.id !== null) this.lastId = this.id
    if (this.dataLines.length === 0) {
      this.eventName = ''
      this.id = null
      return
    }
    const event: SseEvent = {
      event: this.eventName || 'message',
      data: this.dataLines.join('\n'),
      id: this.lastId,
      retry: this.retry,
    }
    this.eventName = ''
    this.dataLines = []
    this.id = null
    this.handlers.onEvent(event)
  }
}
