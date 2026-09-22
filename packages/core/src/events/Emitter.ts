/**
 * Minimal typed event emitter. Listeners may return `false` from cancellable
 * events (`before`) to stop the action.
 */
export type Listener<T> = (payload: T) => void | boolean

export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as Listener<never>)
    return () => this.off(event, listener)
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off()
      return listener(payload)
    })
    return off
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>)
  }

  /** Returns false when any listener returned false. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): boolean {
    const set = this.listeners.get(event)
    if (!set) return true
    let ok = true
    for (const listener of Array.from(set)) {
      if ((listener as Listener<Events[K]>)(payload) === false) ok = false
    }
    return ok
  }

  count(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0
  }

  clear(): void {
    this.listeners.clear()
  }
}
