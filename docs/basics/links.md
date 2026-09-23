# Links

`<BridgeLink>` renders an anchor that navigates through the router instead of reloading the document.

::: code-group

```vue [Vue]
<BridgeLink href="/customers/1">Acme</BridgeLink>
<BridgeLink href="/logout" method="post" as="button">Sign out</BridgeLink>
<BridgeLink
  href="/customers?page=2"
  :only="['customers']"
  preserve-state
  preserve-scroll
>Next</BridgeLink>
```

```tsx [React]
<BridgeLink href="/customers/1">Acme</BridgeLink>
<BridgeLink href="/logout" method="post" as="button">Sign out</BridgeLink>
<BridgeLink href="/customers?page=2" only={['customers']} preserveState preserveScroll>Next</BridgeLink>
```

:::

| Prop                              | Meaning                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `href`                            | Target URL. Cross-origin URLs are followed with a full document load.                            |
| `method`, `data`                  | Request method and body for non-GET links. Non-GET links preserve state by default.              |
| `as`                              | `a` (default) or `button`. Use `button` for non-GET links so they are not crawlable.             |
| `replace`                         | Replace the history entry instead of pushing.                                                    |
| `preserveState`, `preserveScroll` | See [Manual visits](/basics/manual-visits) and [Scroll management](/advanced/scroll-management). |
| `only`, `except`                  | [Partial reload](/data/partial-reloads) selection.                                               |
| `prefetch`                        | `hover` (default, after 75 ms), `mount`, or `false`. See [Prefetching](/data/prefetching).       |
| `activeClass`                     | Class applied when the link's path matches the current page (Vue).                               |

Modifier clicks (new tab, middle click) are left to the browser.
