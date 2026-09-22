import { a as BridgeLink, i as Deferred, r as BridgeHead, s as useDeferred, t as AppLayout_default } from "./AppLayout-BzYPQJMZ.js";
import { Fragment, createBlock, createTextVNode, createVNode, defineComponent, openBlock, renderList, toDisplayString, unref, useSSRContext, withCtx } from "vue";
import { ssrInterpolate, ssrRenderAttr, ssrRenderComponent, ssrRenderList, ssrRenderStyle } from "vue/server-renderer";
//#region resources/js/Pages/Dashboard.vue?vue&type=script&setup=true&lang.ts
var Dashboard_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Dashboard",
	__ssrInlineRender: true,
	props: {
		recentCustomers: {},
		stats: {},
		signups: {}
	},
	setup(__props) {
		const { loading: statsLoading } = useDeferred("stats");
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: "Dashboard · Bridge" }, null, _parent));
			_push(`<h1 class="text-2xl font-semibold">Dashboard</h1><p class="mt-1 text-sm text-slate-500"> Shared props, a deferred <code>stats</code> group and a deferred <code>charts</code> group loaded after first render. </p><section class="mt-6 grid gap-4 sm:grid-cols-3" data-testid="stats"${ssrRenderAttr("data-loading", unref(statsLoading))}>`);
			_push(ssrRenderComponent(unref(Deferred), { data: "stats" }, {
				fallback: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) {
						_push(`<!--[-->`);
						ssrRenderList(3, (i) => {
							_push(`<div class="h-20 animate-pulse rounded bg-slate-200" data-testid="stats-skeleton"${_scopeId}></div>`);
						});
						_push(`<!--]-->`);
					} else return [(openBlock(), createBlock(Fragment, null, renderList(3, (i) => {
						return createVNode("div", {
							key: i,
							class: "h-20 animate-pulse rounded bg-slate-200",
							"data-testid": "stats-skeleton"
						});
					}), 64))];
				}),
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) {
						_push(`<!--[-->`);
						ssrRenderList(__props.stats, (value, key) => {
							_push(`<div class="rounded border border-slate-200 bg-white p-4"${_scopeId}><div class="text-xs uppercase text-slate-500"${_scopeId}>${ssrInterpolate(key)}</div><div class="text-2xl font-semibold"${ssrRenderAttr("data-testid", `stat-${key}`)}${_scopeId}>${ssrInterpolate(value)}</div></div>`);
						});
						_push(`<!--]-->`);
					} else return [(openBlock(true), createBlock(Fragment, null, renderList(__props.stats, (value, key) => {
						return openBlock(), createBlock("div", {
							key,
							class: "rounded border border-slate-200 bg-white p-4"
						}, [createVNode("div", { class: "text-xs uppercase text-slate-500" }, toDisplayString(key), 1), createVNode("div", {
							class: "text-2xl font-semibold",
							"data-testid": `stat-${key}`
						}, toDisplayString(value), 9, ["data-testid"])]);
					}), 128))];
				}),
				_: 1
			}, _parent));
			_push(`</section><section class="mt-8 grid gap-6 md:grid-cols-2"><div><h2 class="font-medium">Recent customers</h2><ul class="mt-2 divide-y divide-slate-200 rounded border border-slate-200 bg-white" data-testid="recent"><!--[-->`);
			ssrRenderList(__props.recentCustomers, (customer) => {
				_push(`<li class="px-3 py-2 text-sm">`);
				_push(ssrRenderComponent(unref(BridgeLink), {
					href: `/customers/${customer.id}`,
					class: "text-indigo-600 hover:underline"
				}, {
					default: withCtx((_, _push, _parent, _scopeId) => {
						if (_push) _push(`${ssrInterpolate(customer.name)}`);
						else return [createTextVNode(toDisplayString(customer.name), 1)];
					}),
					_: 2
				}, _parent));
				_push(`<span class="text-slate-400"> · ${ssrInterpolate(customer.email)}</span></li>`);
			});
			_push(`<!--]--></ul></div><div><h2 class="font-medium">Signups per day</h2>`);
			_push(ssrRenderComponent(unref(Deferred), { data: "signups" }, {
				fallback: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`<div class="mt-2 h-32 animate-pulse rounded bg-slate-200"${_scopeId}></div>`);
					else return [createVNode("div", { class: "mt-2 h-32 animate-pulse rounded bg-slate-200" })];
				}),
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) {
						_push(`<ul class="mt-2 flex h-32 items-end gap-1" data-testid="signups"${_scopeId}><!--[-->`);
						ssrRenderList(__props.signups, (point) => {
							_push(`<li${ssrRenderAttr("title", `${point.day}: ${point.count}`)} class="flex-1 rounded-t bg-indigo-400" style="${ssrRenderStyle({ height: `${Math.min(100, point.count * 10)}%` })}"${_scopeId}></li>`);
						});
						_push(`<!--]--></ul>`);
					} else return [createVNode("ul", {
						class: "mt-2 flex h-32 items-end gap-1",
						"data-testid": "signups"
					}, [(openBlock(true), createBlock(Fragment, null, renderList(__props.signups, (point) => {
						return openBlock(), createBlock("li", {
							key: point.day,
							title: `${point.day}: ${point.count}`,
							class: "flex-1 rounded-t bg-indigo-400",
							style: { height: `${Math.min(100, point.count * 10)}%` }
						}, null, 12, ["title"]);
					}), 128))])];
				}),
				_: 1
			}, _parent));
			_push(`</div></section><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Dashboard.vue
var _sfc_setup = Dashboard_vue_vue_type_script_setup_true_lang_default.setup;
Dashboard_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Dashboard.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Dashboard_default = Dashboard_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Dashboard_default as default };
