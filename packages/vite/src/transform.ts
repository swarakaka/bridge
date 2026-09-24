/**
 * Rewrites `createBridgeApp(...)` and `createSsrRenderer(...)` calls so they
 * resolve page components without a hand-written `resolve`: a call without
 * one gets a resolver over `./Pages`, and a `pages` option is replaced by the
 * resolver it describes. `import.meta.glob` only accepts literal patterns in
 * application source, which is why this happens at build time.
 */
import type {
  CallExpression,
  Expression,
  ImportDeclaration,
  Node,
  ObjectExpression,
  Program,
  Property,
} from 'estree'
import MagicString from 'magic-string'

type Positioned<T> = T & { start: number; end: number }

export interface AdapterConfig {
  /** Page component extensions, most preferred first. */
  extensions: string[]
}

/** Adapter entry points whose factories take a `resolve` option, keyed by import source. */
export const ADAPTERS: Record<string, AdapterConfig> = {
  '@swarakaka/bridge-vue': { extensions: ['.vue'] },
  '@swarakaka/bridge-vue/server': { extensions: ['.vue'] },
  '@swarakaka/bridge-react': { extensions: ['.tsx', '.jsx'] },
  '@swarakaka/bridge-react/server': { extensions: ['.tsx', '.jsx'] },
}

const FACTORIES = new Set(['createBridgeApp', 'createSsrRenderer'])

export const DEFAULT_PAGES_DIRECTORY = './Pages'

export interface PagesConfig {
  path: string
  extensions: string[]
  lazy: boolean
  /** Source text of a `(name) => string` function mapping page names to file names. */
  transform?: string | undefined
}

export interface TransformResult {
  code: string
  map: ReturnType<MagicString['generateMap']>
}

export type Parse = (code: string) => Program

/** Returns null when the module has nothing to rewrite. */
export function transformBridgeCalls(
  code: string,
  id: string,
  parse: Parse,
  adapters: Record<string, AdapterConfig> = ADAPTERS,
): TransformResult | null {
  if (!Object.keys(adapters).some((source) => code.includes(source))) return null

  let program: Program
  try {
    program = parse(code)
  } catch {
    return null
  }

  const factories = importedFactories(program, adapters)
  if (factories.size === 0) return null

  const output = new MagicString(code)
  let changed = false

  walk(program, (node) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
    const adapter = factories.get(node.callee.name)
    if (adapter && rewriteCall(node as Positioned<CallExpression>, adapter, code, output)) {
      changed = true
    }
  })

  if (!changed) return null
  return { code: output.toString(), map: output.generateMap({ hires: true, source: id }) }
}

/** Local names of `createBridgeApp`/`createSsrRenderer` imported from an adapter. */
function importedFactories(program: Program, adapters: Record<string, AdapterConfig>) {
  const factories = new Map<string, AdapterConfig>()
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue
    const adapter = adapters[String((node as ImportDeclaration).source.value)]
    if (!adapter) continue
    for (const specifier of node.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue
      const imported =
        specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : String(specifier.imported.value)
      if (FACTORIES.has(imported)) factories.set(specifier.local.name, adapter)
    }
  }
  return factories
}

function rewriteCall(
  call: Positioned<CallExpression>,
  adapter: AdapterConfig,
  code: string,
  output: MagicString,
): boolean {
  const defaults: PagesConfig = {
    path: DEFAULT_PAGES_DIRECTORY,
    extensions: adapter.extensions,
    lazy: true,
  }

  const [first] = call.arguments
  if (!first) {
    // createBridgeApp() → createBridgeApp({ resolve })
    output.appendLeft(call.end - 1, `{ ${buildResolver(defaults)} }`)
    return true
  }
  if (first.type !== 'ObjectExpression') return false

  const options = first as Positioned<ObjectExpression>
  if (findProperty(options, 'resolve')) return false

  const pages = findProperty(options, 'pages')
  if (pages) {
    const config = readPagesConfig(pages.value as Expression, code, defaults)
    output.overwrite(pages.start, pages.end, buildResolver(config))
    return true
  }

  // Leading, so a spread that carries its own `resolve` still wins.
  const separator = options.properties.length > 0 ? ',' : ''
  output.appendLeft(options.start + 1, ` ${buildResolver(defaults)}${separator}`)
  return true
}

function findProperty(options: ObjectExpression, name: string): Positioned<Property> | null {
  for (const property of options.properties) {
    if (property.type !== 'Property' || property.computed) continue
    const key =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal'
          ? property.key.value
          : null
    if (key === name) return property as Positioned<Property>
  }
  return null
}

function readPagesConfig(value: Expression, code: string, defaults: PagesConfig): PagesConfig {
  const path = stringValue(value)
  if (path !== null) return { ...defaults, path }

  if (value.type !== 'ObjectExpression') {
    throw new Error(
      '[bridge] `pages` must be a string literal or an object literal, e.g. `pages: "./Pages"`.',
    )
  }

  const config = { ...defaults }
  for (const name of ['path', 'extension', 'lazy', 'transform'] as const) {
    const property = findProperty(value, name)
    if (!property) continue
    const node = property.value as Positioned<Expression>
    if (name === 'path') {
      config.path = requireLiteral(stringValue(node), 'pages.path', 'a string')
    } else if (name === 'extension') {
      const single = stringValue(node)
      const list =
        node.type === 'ArrayExpression'
          ? node.elements.map((element) =>
              element && element.type !== 'SpreadElement' ? stringValue(element) : null,
            )
          : null
      config.extensions =
        single !== null
          ? [single]
          : requireLiteral(
              list && list.length > 0 && list.every((item) => item !== null)
                ? (list as string[])
                : null,
              'pages.extension',
              'a string or an array of strings',
            )
    } else if (name === 'lazy') {
      config.lazy = requireLiteral(
        node.type === 'Literal' && typeof node.value === 'boolean' ? node.value : null,
        'pages.lazy',
        'true or false',
      )
    } else {
      config.transform = code.slice(node.start, node.end)
    }
  }
  return config
}

function stringValue(node: Node): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null
  }
  return null
}

function requireLiteral<T>(value: T | null, option: string, expected: string): T {
  if (value === null) {
    throw new Error(`[bridge] \`${option}\` must be ${expected} literal: it is read at build time.`)
  }
  return value
}

/** The `resolve` property that replaces the shorthand. */
export function buildResolver(config: PagesConfig): string {
  const directory = config.path.replace(/\/+$/, '')
  const extensions = config.extensions.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
  const pattern =
    extensions.length === 1
      ? `${directory}/**/*${extensions[0]}`
      : `${directory}/**/*.{${extensions.map((ext) => ext.slice(1)).join(',')}}`

  const file = config.transform ? `(${config.transform})(name)` : 'name'
  const candidates = extensions
    .map((ext) => `${JSON.stringify(`${directory}/`)} + file + ${JSON.stringify(ext)}`)
    .join(', ')
  const notFound = `\`Bridge page component [\${name}] not found in ${escapeTemplate(directory)}.\``

  return `resolve: (name) => {
    const pages = import.meta.glob(${JSON.stringify(pattern)}, { eager: ${!config.lazy} })
    const file = ${file}
    const path = [${candidates}].find((candidate) => candidate in pages)
    if (path === undefined) throw new Error(${notFound})
    return ${config.lazy ? 'pages[path]()' : 'pages[path]'}
  }`
}

function escapeTemplate(value: string): string {
  return value.replace(/[`\\$]/g, (char) => `\\${char}`)
}

function walk(node: unknown, visit: (node: Node) => void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof (node as { type?: unknown }).type === 'string') visit(node as Node)
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walk(value, visit)
  }
}
