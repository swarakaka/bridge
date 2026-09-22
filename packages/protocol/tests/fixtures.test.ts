import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import Ajv2020Module from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import {
  isControlEvent,
  isError,
  isJsonDocument,
  isPage,
  parseBridgeContentType,
  PAGE_ACCEPT,
} from '../src/index.js'

const root = path.resolve(__dirname, '..')
const schema = (name: string) =>
  JSON.parse(readFileSync(path.join(root, 'schemas', `${name}.schema.json`), 'utf8'))
const fixtures = (dir: string, ext = '.json') =>
  readdirSync(path.join(root, 'fixtures', dir))
    .filter((f) => f.endsWith(ext))
    .map((f) => [f, readFileSync(path.join(root, 'fixtures', dir, f), 'utf8')] as const)

// ajv ships CommonJS; under NodeNext the default import is the module object.
const Ajv2020 = ((Ajv2020Module as unknown as { default?: typeof Ajv2020Module }).default ??
  Ajv2020Module) as unknown as new (opts: object) => {
  addSchema(schema: unknown, key: string): void
  getSchema(key: string): ((data: unknown) => boolean) & { errors?: unknown }
}
const ajv = new Ajv2020({ allErrors: true, strict: true })
const addFormats = ((addFormatsModule as unknown as { default?: typeof addFormatsModule })
  .default ?? addFormatsModule) as unknown as (ajv: unknown) => void
addFormats(ajv)
for (const name of ['error', 'page', 'json', 'json-error', 'stream-control']) {
  ajv.addSchema(schema(name), `${name}.schema.json`)
}
const validate = (name: string, data: unknown) => {
  const v = ajv.getSchema(`${name}.schema.json`)!
  const ok = v(data)
  return { ok, errors: v.errors }
}

describe('page fixtures', () => {
  for (const [file, raw] of fixtures('page')) {
    it(`${file} validates and is recognised`, () => {
      const doc = JSON.parse(raw)
      expect(validate('page', doc)).toMatchObject({ ok: true })
      expect(isPage(doc)).toBe(true)
      expect(isError(doc)).toBe(false)
    })
  }
})

describe('error fixtures', () => {
  for (const [file, raw] of fixtures('error')) {
    it(`${file} validates and is recognised`, () => {
      const doc = JSON.parse(raw)
      expect(validate('error', doc)).toMatchObject({ ok: true })
      expect(isError(doc)).toBe(true)
      expect(isPage(doc)).toBe(false)
    })
  }
  it('rejects validation errors without an errors map', () => {
    const doc = {
      protocol: 1,
      type: 'error',
      error: { status: 422, kind: 'validation', message: 'x' },
    }
    expect(validate('error', doc).ok).toBe(false)
  })
})

describe('json fixtures', () => {
  for (const [file, raw] of fixtures('json')) {
    const isErr = file.startsWith('error-')
    it(`${file} validates against ${isErr ? 'json-error' : 'json'}`, () => {
      const doc = JSON.parse(raw)
      expect(validate(isErr ? 'json-error' : 'json', doc)).toMatchObject({ ok: true })
      expect(isJsonDocument(doc)).toBe(!isErr)
    })
  }
})

describe('stream fixtures', () => {
  // Minimal SSE frame splitter: enough to validate fixtures, not a client.
  const parse = (text: string) =>
    text
      .split('\n\n')
      .filter(
        (block) =>
          block.trim() !== '' && !block.split('\n').every((l) => l.startsWith(':') || l === ''),
      )
      .map((block) => {
        const fields: Record<string, string> = {}
        for (const line of block.split('\n')) {
          if (line.startsWith(':') || line === '') continue
          const idx = line.indexOf(':')
          const name = idx === -1 ? line : line.slice(0, idx)
          let value = idx === -1 ? '' : line.slice(idx + 1)
          if (value.startsWith(' ')) value = value.slice(1)
          fields[name] =
            fields[name] !== undefined && name === 'data' ? `${fields[name]}\n${value}` : value
        }
        return fields
      })

  for (const [file, raw] of fixtures('stream', '.txt')) {
    it(`${file}: every bridge control event validates and starts with ready`, () => {
      const frames = parse(raw)
      const events = frames.filter((f) => f.event !== undefined)
      expect(events[0]?.event).toBe('bridge')
      expect(JSON.parse(events[0]!.data!).type).toBe('ready')
      for (const frame of events) {
        if (frame.event !== 'bridge') continue
        const data = JSON.parse(frame.data!)
        expect(isControlEvent(data)).toBe(true)
        const result = validate('stream-control', data)
        expect(result, JSON.stringify(result.errors)).toMatchObject({ ok: true })
      }
    })
  }
})

describe('helpers', () => {
  it('builds the page Accept header', () => {
    expect(PAGE_ACCEPT).toBe('application/vnd.bridge+json; v=1')
  })
  it('parses bridge content types', () => {
    expect(parseBridgeContentType('application/vnd.bridge+json; v=1')).toBe(1)
    expect(parseBridgeContentType('application/vnd.bridge+json;v=2; charset=utf-8')).toBe(2)
    expect(parseBridgeContentType('application/vnd.bridge+json')).toBe(1)
    expect(parseBridgeContentType('application/json')).toBeNull()
    expect(parseBridgeContentType(null)).toBeNull()
  })
})
