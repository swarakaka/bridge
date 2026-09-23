import { n as useHeadContext, r as pageStateRef, t as useBridge } from "../ssr.js";
import { computed, createTextVNode, createVNode, defineComponent, getCurrentScope, h, inject, mergeProps, onBeforeUnmount, onMounted, onScopeDispose, provide, reactive, ref, renderSlot, shallowRef, toDisplayString, unref, useSSRContext, watch, watchEffect, withCtx } from "vue";
import { ssrInterpolate, ssrRenderAttr, ssrRenderAttrs, ssrRenderComponent, ssrRenderList, ssrRenderSlot } from "vue/server-renderer";
//#region ../packages/vue/dist/composables/usePage.js
/** Reactive access to the current page. */
function usePage() {
	const state = pageStateRef(useBridge());
	return {
		page: computed(() => state.value.page),
		component: computed(() => state.value.page?.component ?? ""),
		url: computed(() => state.value.page?.url ?? ""),
		props: computed(() => state.value.page?.props ?? {})
	};
}
/** Reactive ref to one prop (dot keys allowed). Updated by navigation, partial reloads and streams. */
function useProp(key, fallback) {
	const state = pageStateRef(useBridge());
	return computed(() => {
		let cursor = state.value.page?.props;
		for (const segment of key.split(".")) {
			if (typeof cursor !== "object" || cursor === null) return fallback;
			cursor = cursor[segment];
		}
		return cursor === void 0 ? fallback : cursor;
	});
}
/** Loading state and value for a deferred prop. */
function useDeferred(key) {
	const state = pageStateRef(useBridge());
	return {
		loading: computed(() => state.value.loading.has(key)),
		value: computed(() => state.value.page?.props?.[key])
	};
}
//#endregion
//#region ../packages/vue/dist/composables/useForm.js
/**
* A reactive Form. Methods mutate through the proxy so templates update.
* `form.data.name` holds the values; `form.errors.name` the first message.
*/
function useForm(initial, options = {}) {
	const bridge = useBridge();
	const form = reactive(bridge.form(initial, options));
	if (options.remember) {
		const key = `form:${options.remember}`;
		onMounted(() => {
			const restored = bridge.router.restore(key);
			if (restored) form.setData(restored);
		});
		watch(() => form.data, (data) => bridge.router.remember(key, JSON.parse(JSON.stringify(data))), { deep: true });
	}
	return form;
}
//#endregion
//#region ../packages/vue/dist/composables/useStream.js
/**
* Opens an SSE stream and exposes its state reactively. Control events
* (invalidate, prop, navigate) are applied to the page automatically.
*/
function useStream(url, options = {}) {
	const bridge = useBridge();
	const { closeOnDispose, ...streamOptions } = options;
	const server = typeof window === "undefined";
	const stream = bridge.stream(url, {
		...streamOptions,
		autoConnect: server ? false : streamOptions.autoConnect
	});
	const state = ref(stream.state);
	const lastEventAt = ref(stream.lastEventAt);
	const reconnectAttempts = ref(stream.reconnectAttempts);
	stream.on("state", (s) => {
		state.value = s;
		reconnectAttempts.value = stream.reconnectAttempts;
	});
	stream.on("*", () => {
		lastEventAt.value = stream.lastEventAt;
	});
	stream.on("heartbeat", () => {
		lastEventAt.value = stream.lastEventAt;
	});
	if (closeOnDispose !== false && getCurrentScope()) onScopeDispose(() => stream.close());
	const on = ((event, listener) => {
		stream.appEventNames.add(event);
		return stream.events.on(event, listener);
	});
	return {
		client: shallowRef(stream),
		state,
		lastEventAt,
		reconnectAttempts,
		on,
		connect: () => stream.connect(),
		close: () => stream.close()
	};
}
//#endregion
//#region ../packages/vue/dist/composables/useJson.js
/**
* JSON mode from a component: the same routes as page mode, requested with
* `Accept: application/json`, without navigating. `json.data` holds the last
* envelope's `data`, `json.errors.email` the first validation message.
*/
function useJson(options = {}) {
	const bridge = useBridge();
	const { cancelOnDispose, ...handleOptions } = options;
	const json = reactive(bridge.jsonRequest(handleOptions));
	if (cancelOnDispose !== false && getCurrentScope()) onScopeDispose(() => json.cancel());
	return json;
}
//#endregion
//#region ../packages/vue/dist/components/BridgeLink.js
/**
* Anchor that navigates through the router. `prefetch="hover"` (default)
* warms the page cache after a short hover; `"mount"` prefetches immediately.
*/
var BridgeLink = defineComponent({
	name: "BridgeLink",
	props: {
		href: {
			type: String,
			required: true
		},
		method: {
			type: String,
			default: "get"
		},
		data: {
			type: Object,
			default: () => ({})
		},
		as: {
			type: String,
			default: "a"
		},
		replace: {
			type: Boolean,
			default: false
		},
		preserveState: {
			type: Boolean,
			default: false
		},
		preserveScroll: {
			type: Boolean,
			default: false
		},
		only: {
			type: Array,
			default: () => []
		},
		except: {
			type: Array,
			default: () => []
		},
		headers: {
			type: Object,
			default: () => ({})
		},
		prefetch: {
			type: [String, Boolean],
			default: "hover"
		},
		activeClass: {
			type: String,
			default: ""
		}
	},
	emits: [
		"before",
		"start",
		"finish",
		"success",
		"invalid",
		"error"
	],
	setup(props, { slots, emit, attrs }) {
		const bridge = useBridge();
		let hoverTimer = null;
		const doPrefetch = () => {
			if (props.method !== "get") return;
			bridge.router.prefetch(props.href, {
				only: props.only,
				except: props.except,
				headers: props.headers
			});
		};
		onMounted(() => {
			if (props.prefetch === "mount") doPrefetch();
		});
		onBeforeUnmount(() => {
			if (hoverTimer) clearTimeout(hoverTimer);
		});
		const onClick = (event) => {
			if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || attrs.target === "_blank") return;
			event.preventDefault();
			bridge.router.visit(props.href, {
				method: props.method,
				data: props.data,
				replace: props.replace,
				preserveState: props.preserveState || props.method !== "get",
				preserveScroll: props.preserveScroll,
				only: props.only,
				except: props.except,
				headers: props.headers,
				onBefore: (visit) => {
					emit("before", visit);
				},
				onStart: (visit) => emit("start", visit),
				onFinish: (visit) => emit("finish", visit),
				onSuccess: (page) => emit("success", page),
				onInvalid: (errors) => emit("invalid", errors),
				onError: (error) => emit("error", error)
			});
		};
		const onMouseEnter = () => {
			if (props.prefetch !== "hover") return;
			hoverTimer = setTimeout(doPrefetch, 75);
		};
		const onMouseLeave = () => {
			if (hoverTimer) clearTimeout(hoverTimer);
			hoverTimer = null;
		};
		return () => {
			const isAnchor = props.as === "a";
			const current = bridge.store.page?.url ?? "";
			const active = props.activeClass && current.split("?")[0] === props.href.split("?")[0];
			return h(props.as, {
				...isAnchor ? { href: props.href } : { type: "button" },
				class: active ? props.activeClass : void 0,
				onClick,
				onMouseenter: onMouseEnter,
				onMouseleave: onMouseLeave,
				onFocus: onMouseEnter,
				onBlur: onMouseLeave
			}, slots.default?.());
		};
	}
});
//#endregion
//#region ../packages/vue/dist/components/Deferred.js
/** Renders the fallback slot until every listed prop is present on the page. */
var Deferred = defineComponent({
	name: "Deferred",
	props: { data: {
		type: [String, Array],
		required: true
	} },
	setup(props, { slots }) {
		const state = pageStateRef(useBridge());
		const keys = computed(() => Array.isArray(props.data) ? props.data : [props.data]);
		const ready = computed(() => {
			const propsBag = state.value.page?.props ?? {};
			return keys.value.every((key) => key in propsBag);
		});
		return () => ready.value ? slots.default?.() : slots.fallback?.();
	}
});
//#endregion
//#region ../packages/vue/dist/components/BridgeHead.js
/**
* Minimal head management: sets document.title on the client and records
* title/meta into the SSR head context on the server.
*/
var BridgeHead = defineComponent({
	name: "BridgeHead",
	props: {
		title: {
			type: String,
			default: ""
		},
		meta: {
			type: Array,
			default: () => []
		}
	},
	setup(props) {
		const server = useHeadContext();
		if (server) {
			if (props.title) server.title = props.title;
			server.meta.push(...props.meta);
			return () => null;
		}
		const original = typeof document === "undefined" ? "" : document.title;
		watchEffect(() => {
			if (typeof document !== "undefined" && props.title) document.title = props.title;
		});
		onBeforeUnmount(() => {
			if (typeof document !== "undefined" && !props.title) document.title = original;
		});
		return () => null;
	}
});
//#endregion
//#region resources/js/Components/Toast.vue?vue&type=script&setup=true&lang.ts
var Toast_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	__name: "Toast",
	__ssrInlineRender: true,
	props: {
		message: {},
		level: {}
	},
	emits: ["close"],
	setup(__props, { emit: __emit }) {
		const props = __props;
		const emit = __emit;
		let timer = null;
		onMounted(() => timer = setTimeout(() => emit("close"), 4e3));
		onBeforeUnmount(() => timer && clearTimeout(timer));
		const colors = {
			success: "bg-emerald-600",
			info: "bg-sky-600",
			warning: "bg-amber-600",
			error: "bg-rose-600"
		};
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<div${ssrRenderAttrs(mergeProps({
				role: "status",
				"data-testid": "toast",
				"data-level": props.level,
				class: ["fixed right-4 bottom-4 z-50 rounded px-4 py-2 text-sm text-white shadow-lg", colors[props.level] ?? colors.info]
			}, _attrs))}>${ssrInterpolate(props.message)} <button class="ml-3 opacity-70 hover:opacity-100" aria-label="Dismiss"> × </button></div>`);
		};
	}
});
//#endregion
//#region resources/js/Components/Toast.vue
var _sfc_setup$2 = Toast_vue_vue_type_script_setup_true_lang_default.setup;
Toast_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Components/Toast.vue");
	return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
var Toast_default = Toast_vue_vue_type_script_setup_true_lang_default;
//#endregion
//#region resources/js/composables/useAppStream.ts
var AppStreamKey = Symbol("appStream");
/**
* The layout opens one stream per signed-in user and provides it, so every
* page (and the Realtime demo) shares a single connection.
*/
function provideAppStream() {
	const stream = useStream("/events", { autoConnect: true });
	provide(AppStreamKey, stream);
	return stream;
}
function useAppStream() {
	return inject(AppStreamKey, null);
}
//#endregion
//#region resources/js/Components/StreamProvider.vue?vue&type=script&setup=true&lang.ts
var StreamProvider_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	__name: "StreamProvider",
	__ssrInlineRender: true,
	emits: ["notification"],
	setup(__props, { emit: __emit }) {
		const emit = __emit;
		const stream = provideAppStream();
		stream.on("notification", (n) => emit("notification", {
			message: n.message,
			level: n.level,
			title: n.title ?? null
		}));
		watch(stream.state, (state) => {
			if (typeof document !== "undefined") document.documentElement.dataset.bridgeStream = state;
		}, { immediate: true });
		return (_ctx, _push, _parent, _attrs) => {
			ssrRenderSlot(_ctx.$slots, "default", {}, null, _push, _parent);
		};
	}
});
//#endregion
//#region resources/js/Components/StreamProvider.vue
var _sfc_setup$1 = StreamProvider_vue_vue_type_script_setup_true_lang_default.setup;
StreamProvider_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Components/StreamProvider.vue");
	return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
var StreamProvider_default = StreamProvider_vue_vue_type_script_setup_true_lang_default;
//#endregion
//#region resources/js/Layouts/AppLayout.vue?vue&type=script&setup=true&lang.ts
var AppLayout_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	__name: "AppLayout",
	__ssrInlineRender: true,
	setup(__props) {
		const { props: page, url } = usePage();
		const user = computed(() => page.value.auth?.user ?? null);
		const navigating = ref(false);
		const bridge = useBridge();
		bridge.on("start", () => navigating.value = true);
		bridge.on("finish", () => navigating.value = false);
		const flash = ref(null);
		watch(() => page.value.flash, (value) => {
			if (value?.message) flash.value = { ...value };
		}, { immediate: true });
		const links = [
			{
				href: "/",
				label: "Dashboard"
			},
			{
				href: "/customers",
				label: "Customers"
			},
			{
				href: "/realtime",
				label: "Realtime"
			},
			{
				href: "/json",
				label: "JSON demo"
			},
			{
				href: "/errors",
				label: "Errors"
			}
		];
		const notifications = ref([]);
		let nextId = 1;
		const pushNotification = (n) => {
			const id = nextId++;
			notifications.value.push({
				id,
				...n
			});
			setTimeout(() => notifications.value = notifications.value.filter((x) => x.id !== id), 5e3);
		};
		const isActive = (href) => href === "/" ? url.value === "/" : url.value.startsWith(href);
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<div${ssrRenderAttrs(mergeProps({ class: "min-h-screen bg-slate-50 text-slate-900" }, _attrs))}><a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"> Skip to content </a>`);
			if (navigating.value) _push(`<div data-testid="progress" class="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-indigo-500"></div>`);
			else _push(`<!---->`);
			_push(`<header class="border-b border-slate-200 bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"><nav class="flex items-center gap-4" aria-label="Primary">`);
			_push(ssrRenderComponent(unref(BridgeLink), {
				href: "/",
				class: "flex items-center"
			}, {
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`<img${ssrRenderAttr("src", "/logo.svg")} alt="Bridge" width="104" height="32" class="h-8 w-auto"${_scopeId}>`);
					else return [createVNode("img", {
						src: "/logo.svg",
						alt: "Bridge",
						width: "104",
						height: "32",
						class: "h-8 w-auto"
					})];
				}),
				_: 1
			}, _parent));
			_push(`<!--[-->`);
			ssrRenderList(links, (link) => {
				_push(ssrRenderComponent(unref(BridgeLink), {
					key: link.href,
					href: link.href,
					class: ["rounded px-2 py-1 text-sm hover:bg-slate-100", { "bg-slate-100 font-medium": isActive(link.href) }],
					"aria-current": isActive(link.href) ? "page" : void 0
				}, {
					default: withCtx((_, _push, _parent, _scopeId) => {
						if (_push) _push(`${ssrInterpolate(link.label)}`);
						else return [createTextVNode(toDisplayString(link.label), 1)];
					}),
					_: 2
				}, _parent));
			});
			_push(`<!--]--></nav><div class="flex items-center gap-3 text-sm">`);
			if (user.value) {
				_push(`<!--[-->`);
				_push(ssrRenderComponent(unref(BridgeLink), {
					href: "/tokens",
					class: "rounded px-2 py-1 hover:bg-slate-100"
				}, {
					default: withCtx((_, _push, _parent, _scopeId) => {
						if (_push) _push(`Tokens`);
						else return [createTextVNode("Tokens")];
					}),
					_: 1
				}, _parent));
				_push(`<span class="text-slate-500" data-testid="user-name">${ssrInterpolate(user.value.name)}</span>`);
				_push(ssrRenderComponent(unref(BridgeLink), {
					href: "/logout",
					method: "post",
					as: "button",
					class: "rounded bg-slate-800 px-3 py-1 text-white"
				}, {
					default: withCtx((_, _push, _parent, _scopeId) => {
						if (_push) _push(` Sign out `);
						else return [createTextVNode(" Sign out ")];
					}),
					_: 1
				}, _parent));
				_push(`<!--]-->`);
			} else _push(ssrRenderComponent(unref(BridgeLink), {
				href: "/login",
				class: "rounded bg-indigo-600 px-3 py-1 text-white"
			}, {
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`Sign in`);
					else return [createTextVNode("Sign in")];
				}),
				_: 1
			}, _parent));
			_push(`</div></div></header><main id="main" class="mx-auto max-w-5xl px-4 py-8" tabindex="-1">`);
			if (user.value) _push(ssrRenderComponent(StreamProvider_default, {
				key: user.value.id,
				onNotification: pushNotification
			}, {
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) ssrRenderSlot(_ctx.$slots, "default", {}, null, _push, _parent, _scopeId);
					else return [renderSlot(_ctx.$slots, "default")];
				}),
				_: 3
			}, _parent));
			else ssrRenderSlot(_ctx.$slots, "default", {}, null, _push, _parent);
			_push(`</main><div class="fixed right-4 top-16 z-50 space-y-2" data-testid="notifications" role="status" aria-live="polite"><!--[-->`);
			ssrRenderList(notifications.value, (n) => {
				_push(`<div class="w-72 rounded border border-slate-200 bg-white p-3 text-sm shadow-lg"${ssrRenderAttr("data-level", n.level)} data-testid="notification">`);
				if (n.title) _push(`<div class="text-xs font-medium uppercase text-slate-500">${ssrInterpolate(n.title)}</div>`);
				else _push(`<!---->`);
				_push(`<div>${ssrInterpolate(n.message)}</div></div>`);
			});
			_push(`<!--]--></div>`);
			if (flash.value) _push(ssrRenderComponent(Toast_default, {
				message: flash.value.message ?? "",
				level: flash.value.level ?? "success",
				onClose: ($event) => flash.value = null
			}, null, _parent));
			else _push(`<!---->`);
			_push(`</div>`);
		};
	}
});
//#endregion
//#region resources/js/Layouts/AppLayout.vue
var _sfc_setup = AppLayout_vue_vue_type_script_setup_true_lang_default.setup;
AppLayout_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Layouts/AppLayout.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var AppLayout_default = AppLayout_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { BridgeLink as a, useDeferred as c, Deferred as i, useProp as l, useAppStream as n, useJson as o, BridgeHead as r, useForm as s, AppLayout_default as t };
