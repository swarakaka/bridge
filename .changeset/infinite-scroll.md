---
'@swarakaka/bridge-protocol': minor
'@swarakaka/bridge-core': minor
'@swarakaka/bridge-vue': minor
'@swarakaka/bridge-react': minor
---

Infinite scroll: `Bridge::scroll($paginator)` (length-aware, simple or cursor paginators, or a resource collection over one) is an append merge prop matched on `data.id`, with the list's ends in `meta.scroll` (spec/page.md §12). `<InfiniteScroll data="customers">` (Vue and React) loads the next page at the bottom edge and the previous page at the top (keeping the viewport still), replaces the address with the page just loaded, restores its ends from history, and starts over when another visit replaces the prop. Options: `buffer`, `manual`, `manualAfter`, `reverse`, `preserveUrl`, `only`, `as`; slots for the manual controls and loading state; `useInfiniteScroll()` for custom markup; core `InfiniteScroll` controller. Fixed: a sealed (encrypted) history entry now changes the address at once when its page URL changes.
