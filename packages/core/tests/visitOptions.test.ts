import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeQuery, PageCache } from '../src/index.js'
import type { Bridge, Visit } from '../src/index.js'
import { bridgeWith, mockFetch, page, pageResponse } from './helpers.js'

let bridge: Bridge | null = null
beforeEach(() => window.history.replaceState(null, '', '/customers'))
afterEach(() => {
  bridge?.destroy()
  bridge = null
})

describe('queryStringArrayFormat', () => {
  it('writes arrays with indices by default and with empty brackets on request', () => {
    const data = { tags: ['a', 'b'], filter: { ids: [1] } }

    expect(decodeURIComponent(mergeQuery('/x', data).search)).toBe(
      '?tags[0]=a&tags[1]=b&filter[ids][0]=1',
    )
    expect(decodeURIComponent(mergeQuery('/x', data, 'brackets').search)).toBe(
      '?tags[]=a&tags[]=b&filter[ids][]=1',
    )
  })

  it('replaces keys already in the URL instead of duplicating them', () => {
    expect(
      decodeURIComponent(
        mergeQuery('/x?page=1&tags[]=old', { page: 2, tags: ['new'] }, 'brackets').search,
      ),
    ).toBe('?page=2&tags[]=new')
  })

  it('applies to GET visits', async () => {
    const fetch = mockFetch(() => pageResponse(page()))
    bridge = bridgeWith(fetch)

    await bridge.router.get(
      '/customers',
      { tags: ['a', 'b'] },
      { queryStringArrayFormat: 'brackets' },
    )

    expect(decodeURIComponent(fetch.calls()[0]!.url)).toContain('tags[]=a&tags[]=b')
  })
})

describe('preserveUrl', () => {
  it('shows the new page under the current address', async () => {
    window.history.replaceState(null, '', '/customers?page=1')
    const fetch = mockFetch(() =>
      pageResponse(page({ url: '/customers?page=2', props: { customers: [{ id: 2 }] } })),
    )
    bridge = bridgeWith(fetch, { initialPage: page({ url: '/customers?page=1' }) })

    await bridge.router.visit('/customers?page=2', { preserveUrl: true })

    expect(fetch.calls()[0]!.url).toContain('page=2')
    expect(window.location.pathname + window.location.search).toBe('/customers?page=1')
    expect(bridge.router.page?.url).toBe('/customers?page=1')
    expect((bridge.router.page?.props as { customers: unknown }).customers).toEqual([{ id: 2 }])
  })

  it('without it the address follows the response', async () => {
    window.history.replaceState(null, '', '/customers?page=1')
    bridge = bridgeWith(
      mockFetch(() => pageResponse(page({ url: '/customers?page=2' }))),
      {
        initialPage: page({ url: '/customers?page=1' }),
      },
    )

    await bridge.router.visit('/customers?page=2')

    expect(window.location.search).toBe('?page=2')
  })
})

describe('showProgress', () => {
  it('is carried on the visit for progress indicators (default true)', async () => {
    bridge = bridgeWith(mockFetch(() => pageResponse(page())))
    const seen: boolean[] = []
    bridge.on('start', (visit: Visit) => {
      seen.push(visit.showProgress)
    })

    await bridge.router.visit('/customers')
    await bridge.router.visit('/other', { showProgress: false })

    expect(seen).toEqual([true, false])
  })
})

describe('cache tags', () => {
  const key = (url: string) => PageCache.key(url)

  it('prefetch tags entries and flushByCacheTags removes those with any listed tag', async () => {
    const fetch = mockFetch((url) =>
      pageResponse(page({ url: new URL(url).pathname, component: 'X' })),
    )
    bridge = bridgeWith(fetch)
    await bridge.router.prefetch('/users', { cacheTags: 'users' })
    await bridge.router.prefetch('/stats', { cacheTags: ['dashboard', 'stats'] })
    await bridge.router.prefetch('/plain')

    bridge.router.flushByCacheTags(['users', 'stats'])

    expect(bridge.cache.get(key('/users')).state).toBe('miss')
    expect(bridge.cache.get(key('/stats')).state).toBe('miss')
    expect(bridge.cache.get(key('/plain')).state).toBe('fresh')
  })

  it('a visit refreshing a tagged entry keeps its tags', async () => {
    bridge = bridgeWith(mockFetch((url) => pageResponse(page({ url: new URL(url).pathname }))))
    await bridge.router.prefetch('/users', { cacheTags: 'users' })
    bridge.cache.set(key('/users'), page({ url: '/users' }))

    bridge.router.flushByCacheTags('users')

    expect(bridge.cache.get(key('/users')).state).toBe('miss')
  })

  it('invalidateCacheTags flushes after a successful visit, not after a failed one', async () => {
    let status = 500
    const fetch = mockFetch((url) =>
      new URL(url).pathname === '/action' && status === 500
        ? pageResponse(
            {
              protocol: 1,
              type: 'error',
              error: { status: 500, kind: 'server', message: 'No' },
            },
            { status: 500 },
          )
        : pageResponse(page({ url: new URL(url).pathname })),
    )
    bridge = bridgeWith(fetch)
    bridge.on('error', () => false)
    await bridge.router.prefetch('/users', { cacheTags: 'users' })
    await bridge.router.prefetch('/other', { cacheTags: 'other' })

    await bridge.router.visit('/action', { invalidateCacheTags: 'users', useCache: false })
    expect(bridge.cache.get(key('/users')).state).toBe('fresh')

    status = 200
    await bridge.router.visit('/action', { invalidateCacheTags: ['users'], useCache: false })
    expect(bridge.cache.get(key('/users')).state).toBe('miss')
    expect(bridge.cache.get(key('/other')).state).toBe('fresh')
  })
})
