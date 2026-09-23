# Scroll management

Bridge behaves like a multi-page site by default: a new page starts at the top, and back or forward restores the position the user left.

## Preserving scroll

For visits that update the current page rather than leave it, keep the position:

::: code-group

```vue [Vue]
<BridgeLink href="/customers?page=2" :only="['customers']" preserve-scroll>Next</BridgeLink>
```

```ts [Router]
router.reload({ only: ['stats'], preserveScroll: true })
```

:::

Partial reloads triggered by [stream invalidations](/realtime/streams) always preserve scroll.

## Scroll regions

If your layout scrolls inside an element rather than the window, mark it:

```html
<div class="overflow-y-auto" bridge-scroll-region>…</div>
```

Bridge records and restores the scroll offset of every `[bridge-scroll-region]` element alongside the window's.

## Anchors

A visit to a URL with a fragment (`/docs#install`) scrolls to the element with that id after the swap. History navigation restores the saved position instead.

## How it works

Every page swap stores the window and region offsets in `history.state`. On a `popstate` the stored page is restored first and the offsets are applied after it renders, so restoration works even though the document never reloads.
