# @swarakaka/bridge-react

**Experimental skeleton.** A React adapter over `@swarakaka/bridge-core`, written to prove that a second view layer needs no server changes. It provides `createBridgeApp`, `useBridge`, `usePage`, `useProp`, `useForm`, `BridgeLink` and `Deferred`. Streams are available through `useBridge().stream()`. SSR, `useRemember` and a head component are not implemented yet.

```tsx
import { createBridgeApp } from '@swarakaka/bridge-react'

const pages = import.meta.glob('./Pages/**/*.tsx')
createBridgeApp({ resolve: (name) => pages[`./Pages/${name}.tsx`]!() })
```

Page components receive props directly; a static `layout` property wraps them.
