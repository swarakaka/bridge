import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import bridge from '../src/index.js'

const fixture = join(import.meta.dirname, 'fixture')
let outDir: string

afterAll(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true })
})

describe('bridge() in a Vite build', () => {
  it('resolves pages through import.meta.glob', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'bridge-vite-'))
    await build({
      root: fixture,
      logLevel: 'silent',
      configFile: false,
      resolve: { alias: { 'fake-adapter': join(fixture, 'adapter.js') } },
      plugins: [bridge({ adapters: { 'fake-adapter': { extensions: ['.js'] } } })],
      build: { ssr: join(fixture, 'app.js'), outDir, emptyOutDir: true },
    })

    type Resolve = (name: string) => unknown
    const app = (await import(pathToFileURL(join(outDir, 'app.js')).href)) as {
      defaults: { resolve: Resolve }
      views: { resolve: Resolve }
    }

    await expect(app.defaults.resolve('Customers/Index')).resolves.toMatchObject({
      default: { name: 'Customers/Index' },
    })
    await expect(async () => app.defaults.resolve('Missing')).rejects.toThrow(
      'Bridge page component [Missing] not found in ./Pages.',
    )
    expect(app.views.resolve('About')).toMatchObject({ default: { name: 'about' } })
  })
})
