import { describe, expect, it } from 'vitest'
import { PageCache } from '../src/index.js'
import { page } from './helpers.js'

describe('PageCache', () => {
  it('serves fresh, then stale, then misses', () => {
    let now = 0
    const cache = new PageCache({ ttl: 100, staleWhileRevalidate: 100, now: () => now })
    cache.set('/a', page())
    expect(cache.get('/a').state).toBe('fresh')
    now = 150
    expect(cache.get('/a').state).toBe('stale')
    now = 250
    expect(cache.get('/a').state).toBe('miss')
    expect(cache.size).toBe(0)
  })

  it('evicts least recently used entries', () => {
    const cache = new PageCache({ max: 2 })
    cache.set('/a', page())
    cache.set('/b', page())
    cache.get('/a')
    cache.set('/c', page())
    expect(cache.get('/b').state).toBe('miss')
    expect(cache.get('/a').state).toBe('fresh')
  })

  it('keys by url and sorted partial selection', () => {
    expect(PageCache.key('/a', ['y', 'x'])).toBe('/a|only=x,y')
    expect(PageCache.key('/a', undefined, ['z'])).toBe('/a|except=z')
    expect(PageCache.key('/a')).toBe('/a')
  })
})
