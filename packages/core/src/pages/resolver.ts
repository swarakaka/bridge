/**
 * The `pages` shorthand. `@swarakaka/bridge-vite` replaces it with a `resolve`
 * function at build time; it has no effect at runtime.
 */
export type PagesOption =
  | string
  | {
      /** Directory relative to the file that calls the factory (default `./Pages`). */
      path?: string
      /** Page file extension(s); defaults to the adapter's (`.vue`, or `.tsx` and `.jsx`). */
      extension?: string | string[]
      /** Load pages on demand (default) or bundle them all up front. */
      lazy?: boolean
      /** Maps a component name from the server to a file name under `path`. */
      transform?: (name: string) => string
    }

/** The resolver an adapter was given, or an error that says how to get one. */
export function requireResolver<T>(
  options: { resolve?: T | undefined; pages?: PagesOption | undefined },
  factory: string,
): T {
  if (options.resolve) return options.resolve
  if (options.pages !== undefined) {
    throw new Error(
      `${factory}: the \`pages\` option is compiled by the @swarakaka/bridge-vite plugin. Add bridge() to your Vite plugins, or pass \`resolve\`.`,
    )
  }
  throw new Error(
    `${factory} needs a \`resolve\` function. Add bridge() from @swarakaka/bridge-vite to your Vite plugins to resolve components from ./Pages, or pass \`resolve\`.`,
  )
}
