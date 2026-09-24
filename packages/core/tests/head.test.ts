import { afterEach, describe, expect, it } from 'vitest'
import { HEAD_ATTRIBUTE, HeadManager, renderHead } from '../src/index.js'

describe('renderHead', () => {
  it('escapes the title and attribute values', () => {
    expect(
      renderHead({
        title: '</title><script>x</script>',
        meta: [{ name: 'description', content: '"><script>x</script>' }],
      }),
    ).toEqual([
      '<title>&lt;/title&gt;&lt;script&gt;x&lt;/script&gt;</title>',
      '<meta name="description" content="&quot;&gt;&lt;script&gt;x&lt;/script&gt;" data-bridge-head="ssr">',
    ])
  })

  it('drops attribute names that would inject markup', () => {
    expect(
      renderHead({
        title: null,
        meta: [
          { 'name="x" onload="alert(1)" x': 'y', property: 'og:title', content: 'Hi' },
          { '><script>alert(1)</script><meta a': 'b' },
          { [HEAD_ATTRIBUTE]: 'client', 'http-equiv': 'refresh', content: '5' },
        ],
      }),
    ).toEqual([
      '<meta property="og:title" content="Hi" data-bridge-head="ssr">',
      '<meta http-equiv="refresh" content="5" data-bridge-head="ssr">',
    ])
  })
})

describe('HeadManager', () => {
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('skips invalid attribute names instead of throwing', () => {
    const head = new HeadManager(document)
    expect(() =>
      head.apply({ meta: [{ 'bad name"': 'x', name: 'description', content: 'ok' }] }),
    ).not.toThrow()
    expect(document.head.innerHTML).toBe(
      '<meta name="description" content="ok" data-bridge-head="client">',
    )
  })
})
