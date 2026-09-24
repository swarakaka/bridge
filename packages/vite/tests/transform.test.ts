import type { Program } from 'estree'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'
import { buildResolver, transformBridgeCalls } from '../src/transform.js'

const parse = (code: string) => parseAst(code) as Program
const transform = (code: string) => transformBridgeCalls(code, 'app.js', parse)?.code ?? null

const vue = `import { createBridgeApp } from '@swarakaka/bridge-vue'\n`

describe('transformBridgeCalls', () => {
  it('injects a resolver into an empty call', () => {
    const code = transform(`${vue}createBridgeApp()`)
    expect(code).toContain('createBridgeApp({ resolve: (name) => {')
    expect(code).toContain(`import.meta.glob("./Pages/**/*.vue", { eager: false })`)
    expect(code).toContain('return pages[path]()')
  })

  it('injects into an empty object and before existing options', () => {
    expect(transform(`${vue}createBridgeApp({})`)).toMatch(
      /createBridgeApp\(\{ resolve: [\s\S]*\}\s*\}\)$/,
    )
    const code = transform(`${vue}createBridgeApp({ id: 'root', ...rest })`)!
    expect(code.indexOf('resolve:')).toBeLessThan(code.indexOf(`id: 'root'`))
    expect(code).toMatch(/\},\s*id: 'root', \.\.\.rest \}\)$/)
  })

  it('keeps an explicit resolve', () => {
    expect(transform(`${vue}createBridgeApp({ resolve: (n) => import(n) })`)).toBeNull()
    expect(transform(`${vue}createBridgeApp({ 'resolve': r })`)).toBeNull()
  })

  it('skips calls it cannot see into', () => {
    expect(transform(`${vue}createBridgeApp(options)`)).toBeNull()
  })

  it('replaces a pages directory', () => {
    const code = transform(`${vue}createBridgeApp({ pages: './Views/', id: 'x' })`)!
    expect(code).not.toContain('pages:')
    expect(code).toContain(`import.meta.glob("./Views/**/*.vue"`)
    expect(code).toContain(`["./Views/" + file + ".vue"]`)
    expect(code).toContain(`id: 'x'`)
  })

  it('reads the pages object form', () => {
    const code = transform(
      `${vue}createBridgeApp({ pages: { path: \`./P\`, extension: ['.vue', 'ts'], lazy: false, transform: (n) => n.toLowerCase() } })`,
    )!
    expect(code).toContain(`import.meta.glob("./P/**/*.{vue,ts}", { eager: true })`)
    expect(code).toContain('const file = ((n) => n.toLowerCase())(name)')
    expect(code).toContain(`["./P/" + file + ".vue", "./P/" + file + ".ts"]`)
    expect(code).toContain('return pages[path]\n')
  })

  it('rejects a pages value it cannot read at build time', () => {
    expect(() => transform(`${vue}createBridgeApp({ pages: dir })`)).toThrow(/string literal/)
    expect(() => transform(`${vue}createBridgeApp({ pages: { path: dir } })`)).toThrow(
      /pages\.path/,
    )
  })

  it('uses the adapter extensions and follows aliased imports', () => {
    const react = transform(
      `import { createSsrRenderer as renderer } from '@swarakaka/bridge-react/server'\nrenderer()`,
    )!
    expect(react).toContain(`import.meta.glob("./Pages/**/*.{tsx,jsx}"`)
    expect(react).toContain(`["./Pages/" + file + ".tsx", "./Pages/" + file + ".jsx"]`)
  })

  it('ignores same-named functions from elsewhere', () => {
    expect(transform(`import { createBridgeApp } from './local'\ncreateBridgeApp()`)).toBeNull()
    expect(transform(`${vue}function f(createBridgeApp) {}\nother()`)).toBeNull()
  })

  it('returns a source map', () => {
    const result = transformBridgeCalls(`${vue}createBridgeApp()`, 'app.js', parse)!
    expect(result.map.sources).toEqual(['app.js'])
  })

  it('escapes the directory in the not-found message', () => {
    expect(buildResolver({ path: './`${x}', extensions: ['.vue'], lazy: true })).toContain(
      'not found in ./\\`\\${x}.`',
    )
  })
})
