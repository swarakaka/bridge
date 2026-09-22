import { i as router } from "../ssr.js";
import { a as BridgeLink, i as Deferred, r as BridgeHead, t as AppLayout_default } from "./AppLayout-BzYPQJMZ.js";
import { createTextVNode, createVNode, defineComponent, mergeProps, ref, toDisplayString, unref, useSSRContext, watch, withCtx } from "vue";
import { ssrIncludeBooleanAttr, ssrInterpolate, ssrRenderAttr, ssrRenderAttrs, ssrRenderClass, ssrRenderComponent, ssrRenderList } from "vue/server-renderer";
//#region resources/js/Components/Pagination.vue?vue&type=script&setup=true&lang.ts
var Pagination_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	__name: "Pagination",
	__ssrInlineRender: true,
	props: {
		meta: {},
		only: {}
	},
	setup(__props) {
		return (_ctx, _push, _parent, _attrs) => {
			if (__props.meta.last_page > 1) {
				_push(`<nav${ssrRenderAttrs(mergeProps({
					class: "flex items-center gap-1 text-sm",
					"aria-label": "Pagination",
					"data-testid": "pagination"
				}, _attrs))}><!--[-->`);
				ssrRenderList(__props.meta.links, (link) => {
					_push(`<!--[-->`);
					if (link.url) _push(ssrRenderComponent(unref(BridgeLink), {
						href: link.url,
						only: __props.only ?? [],
						"preserve-state": "",
						"preserve-scroll": "",
						class: ["rounded border px-2 py-1", link.active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 hover:bg-slate-100"]
					}, {
						default: withCtx((_, _push, _parent, _scopeId) => {
							if (_push) _push(`<span${_scopeId}>${link.label ?? ""}</span>`);
							else return [createVNode("span", { innerHTML: link.label }, null, 8, ["innerHTML"])];
						}),
						_: 2
					}, _parent));
					else _push(`<span class="px-2 py-1 text-slate-400">${link.label ?? ""}</span>`);
					_push(`<!--]-->`);
				});
				_push(`<!--]--><span class="ml-2 text-slate-500">${ssrInterpolate(__props.meta.from)}–${ssrInterpolate(__props.meta.to)} of ${ssrInterpolate(__props.meta.total)}</span></nav>`);
			} else _push(`<!---->`);
		};
	}
});
//#endregion
//#region resources/js/Components/Pagination.vue
var _sfc_setup$1 = Pagination_vue_vue_type_script_setup_true_lang_default.setup;
Pagination_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Components/Pagination.vue");
	return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
var Pagination_default = Pagination_vue_vue_type_script_setup_true_lang_default;
//#endregion
//#region resources/js/Pages/Customers/Index.vue?vue&type=script&setup=true&lang.ts
var Index_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Index",
	__ssrInlineRender: true,
	props: {
		customers: {},
		filters: {},
		stats: {}
	},
	setup(__props) {
		const search = ref(__props.filters.search ?? "");
		let timer = null;
		const loadingMore = ref(false);
		watch(search, (value) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				router.get("/customers", value ? { search: value } : {}, {
					only: ["customers", "filters"],
					preserveState: true,
					preserveScroll: true,
					replace: true
				});
			}, 250);
		});
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: "Customers · Bridge" }, null, _parent));
			_push(`<div class="flex items-center justify-between"><div><h1 class="text-2xl font-semibold">Customers</h1>`);
			_push(ssrRenderComponent(unref(Deferred), { data: "stats" }, {
				fallback: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`<p class="text-sm text-slate-400"${_scopeId}>Loading stats…</p>`);
					else return [createVNode("p", { class: "text-sm text-slate-400" }, "Loading stats…")];
				}),
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`<p class="text-sm text-slate-500" data-testid="customer-stats"${_scopeId}>${ssrInterpolate(__props.stats?.total)} total · ${ssrInterpolate(__props.stats?.active)} active </p>`);
					else return [createVNode("p", {
						class: "text-sm text-slate-500",
						"data-testid": "customer-stats"
					}, toDisplayString(__props.stats?.total) + " total · " + toDisplayString(__props.stats?.active) + " active ", 1)];
				}),
				_: 1
			}, _parent));
			_push(`</div>`);
			_push(ssrRenderComponent(unref(BridgeLink), {
				href: "/customers/create",
				class: "rounded bg-indigo-600 px-3 py-2 text-sm text-white",
				"data-testid": "new-customer"
			}, {
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(` New customer `);
					else return [createTextVNode(" New customer ")];
				}),
				_: 1
			}, _parent));
			_push(`</div><input${ssrRenderAttr("value", search.value)} type="search" placeholder="Search name, email or company" class="mt-4 w-full rounded border border-slate-300 px-3 py-2" data-testid="search"><table class="mt-4 w-full text-sm" data-testid="customers-table"><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-2">Name</th><th>Email</th><th>Company</th><th>Status</th></tr></thead><tbody class="divide-y divide-slate-200 bg-white"><!--[-->`);
			ssrRenderList(__props.customers.data, (customer) => {
				_push(`<tr data-testid="customer-row"><td class="py-2">`);
				_push(ssrRenderComponent(unref(BridgeLink), {
					href: `/customers/${customer.id}`,
					class: "text-indigo-600 hover:underline",
					prefetch: "hover"
				}, {
					default: withCtx((_, _push, _parent, _scopeId) => {
						if (_push) _push(`${ssrInterpolate(customer.name)}`);
						else return [createTextVNode(toDisplayString(customer.name), 1)];
					}),
					_: 2
				}, _parent));
				if (customer.locked) _push(`<span class="ml-1 text-xs text-amber-600" title="Locked">🔒</span>`);
				else _push(`<!---->`);
				_push(`</td><td>${ssrInterpolate(customer.email)}</td><td>${ssrInterpolate(customer.company)}</td><td><span class="${ssrRenderClass([customer.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600", "rounded px-2 py-0.5 text-xs"])}">${ssrInterpolate(customer.status)}</span></td></tr>`);
			});
			_push(`<!--]-->`);
			if (__props.customers.data.length === 0) _push(`<tr><td colspan="4" class="py-6 text-center text-slate-400" data-testid="empty"> No customers match. </td></tr>`);
			else _push(`<!---->`);
			_push(`</tbody></table><div class="mt-4 flex items-center justify-between gap-4">`);
			_push(ssrRenderComponent(Pagination_default, {
				meta: __props.customers.meta,
				only: ["customers"]
			}, null, _parent));
			if (__props.customers.meta.current_page < __props.customers.meta.last_page) _push(`<button type="button" class="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"${ssrIncludeBooleanAttr(loadingMore.value) ? " disabled" : ""} data-testid="load-more">${ssrInterpolate(loadingMore.value ? "Loading…" : `Load more (${__props.customers.data.length} of ${__props.customers.meta.total})`)}</button>`);
			else _push(`<!---->`);
			_push(`</div><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Customers/Index.vue
var _sfc_setup = Index_vue_vue_type_script_setup_true_lang_default.setup;
Index_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Customers/Index.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Index_default = Index_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Index_default as default };
