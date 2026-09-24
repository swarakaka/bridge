import type { Method, QueryStringArrayFormat } from '@swarakaka/bridge-core'
import { defineComponent, h, onBeforeUnmount, onMounted, type PropType } from 'vue'
import { useBridge } from '../injection.js'
import { pageStateRef } from '../state.js'

/**
 * Anchor that navigates through the router. `prefetch="hover"` (default)
 * warms the page cache after a short hover; `"mount"` prefetches immediately.
 */
export const BridgeLink = defineComponent({
  name: 'BridgeLink',
  props: {
    href: { type: String, required: true },
    method: { type: String as PropType<Method>, default: 'get' },
    data: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
    as: { type: String, default: 'a' },
    replace: { type: Boolean, default: false },
    preserveState: { type: Boolean, default: false },
    preserveScroll: { type: Boolean, default: false },
    only: { type: Array as PropType<string[]>, default: () => [] },
    except: { type: Array as PropType<string[]>, default: () => [] },
    headers: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
    prefetch: { type: [String, Boolean] as PropType<'hover' | 'mount' | false>, default: 'hover' },
    /** Tags for the prefetched page, for `router.flushByCacheTags`. */
    cacheTags: { type: [String, Array] as PropType<string | string[]>, default: undefined },
    invalidateCacheTags: {
      type: [String, Array] as PropType<string | string[]>,
      default: undefined,
    },
    showProgress: { type: Boolean, default: true },
    preserveUrl: { type: Boolean, default: false },
    queryStringArrayFormat: {
      type: String as PropType<QueryStringArrayFormat>,
      default: undefined,
    },
    activeClass: { type: String, default: '' },
  },
  emits: ['before', 'start', 'finish', 'success', 'invalid', 'error'],
  setup(props, { slots, emit, attrs }) {
    const bridge = useBridge()
    const pageState = pageStateRef(bridge)
    let hoverTimer: ReturnType<typeof setTimeout> | null = null

    const doPrefetch = (): void => {
      if (props.method !== 'get') return
      void bridge.router.prefetch(props.href, {
        only: props.only,
        except: props.except,
        headers: props.headers,
        cacheTags: props.cacheTags,
      })
    }

    onMounted(() => {
      if (props.prefetch === 'mount') doPrefetch()
    })
    onBeforeUnmount(() => {
      if (hoverTimer) clearTimeout(hoverTimer)
    })

    const onClick = (event: MouseEvent): void => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (attrs.target as string | undefined) === '_blank'
      ) {
        return
      }
      event.preventDefault()
      void bridge.router.visit(props.href, {
        method: props.method,
        data: props.data,
        replace: props.replace,
        preserveState: props.preserveState || props.method !== 'get',
        preserveScroll: props.preserveScroll,
        only: props.only,
        except: props.except,
        headers: props.headers,
        showProgress: props.showProgress,
        preserveUrl: props.preserveUrl,
        queryStringArrayFormat: props.queryStringArrayFormat,
        invalidateCacheTags: props.invalidateCacheTags,
        onBefore: (visit) => {
          emit('before', visit)
        },
        onStart: (visit) => emit('start', visit),
        onFinish: (visit) => emit('finish', visit),
        onSuccess: (page) => emit('success', page),
        onInvalid: (errors) => emit('invalid', errors),
        onError: (error) => emit('error', error),
      })
    }

    const onMouseEnter = (): void => {
      if (props.prefetch !== 'hover') return
      hoverTimer = setTimeout(doPrefetch, 75)
    }
    const onMouseLeave = (): void => {
      if (hoverTimer) clearTimeout(hoverTimer)
      hoverTimer = null
    }

    return () => {
      const isAnchor = props.as === 'a'
      // Read through the reactive mirror so the class follows navigation.
      const current = pageState.value.page?.url ?? ''
      const active = props.activeClass && current.split('?')[0] === props.href.split('?')[0]
      return h(
        props.as,
        {
          ...(isAnchor ? { href: props.href } : { type: 'button' }),
          class: active ? props.activeClass : undefined,
          onClick,
          onMouseenter: onMouseEnter,
          onMouseleave: onMouseLeave,
          onFocus: onMouseEnter,
          onBlur: onMouseLeave,
        },
        slots.default?.(),
      )
    }
  },
})
