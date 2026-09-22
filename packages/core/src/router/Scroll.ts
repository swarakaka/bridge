import type { ScrollPositions } from './History.js'

export const SCROLL_REGION_ATTRIBUTE = 'bridge-scroll-region'

export function captureScroll(doc: Document = document): ScrollPositions {
  const win = doc.defaultView
  const regions = Array.from(doc.querySelectorAll<HTMLElement>(`[${SCROLL_REGION_ATTRIBUTE}]`)).map(
    (el) => [el.scrollLeft, el.scrollTop] as [number, number],
  )
  return { window: [win?.scrollX ?? 0, win?.scrollY ?? 0], regions }
}

export function restoreScroll(positions: ScrollPositions, doc: Document = document): void {
  doc.defaultView?.scrollTo(positions.window[0], positions.window[1])
  const regions = doc.querySelectorAll<HTMLElement>(`[${SCROLL_REGION_ATTRIBUTE}]`)
  positions.regions.forEach(([left, top], i) => {
    const el = regions[i]
    if (el) {
      el.scrollLeft = left
      el.scrollTop = top
    }
  })
}

export function resetScroll(doc: Document = document, hash = ''): void {
  if (hash) {
    const target = doc.getElementById(hash.replace(/^#/, ''))
    if (target) {
      target.scrollIntoView()
      return
    }
  }
  doc.defaultView?.scrollTo(0, 0)
  doc.querySelectorAll<HTMLElement>(`[${SCROLL_REGION_ATTRIBUTE}]`).forEach((el) => {
    el.scrollLeft = 0
    el.scrollTop = 0
  })
}
