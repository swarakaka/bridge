import { a as BridgeLink, r as BridgeHead, t as AppLayout_default } from "./AppLayout-B-H39FZD.js";
import { createTextVNode, defineComponent, unref, useSSRContext, withCtx } from "vue";
import { ssrInterpolate, ssrRenderAttr, ssrRenderComponent } from "vue/server-renderer";
//#region resources/js/Pages/Customers/Show.vue?vue&type=script&setup=true&lang.ts
var Show_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Show",
	__ssrInlineRender: true,
	props: { customer: {} },
	setup(__props) {
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: `${__props.customer.name} · Bridge` }, null, _parent));
			_push(`<div class="flex items-start justify-between"><div class="flex items-center gap-4">`);
			if (__props.customer.avatar_url) _push(`<img${ssrRenderAttr("src", __props.customer.avatar_url)} alt="" class="h-16 w-16 rounded-full object-cover" data-testid="avatar">`);
			else _push(`<!---->`);
			_push(`<div><h1 class="text-2xl font-semibold" data-testid="customer-name">${ssrInterpolate(__props.customer.name)}</h1><p class="text-slate-500">${ssrInterpolate(__props.customer.email)} · ${ssrInterpolate(__props.customer.company ?? "—")}</p>`);
			if (__props.customer.locked) _push(`<p class="mt-1 text-sm text-amber-600" data-testid="locked"> Locked: editing and deleting return 403 in every mode. </p>`);
			else _push(`<!---->`);
			_push(`</div></div><div class="flex gap-2 text-sm">`);
			_push(ssrRenderComponent(unref(BridgeLink), {
				href: `/customers/${__props.customer.id}/edit`,
				class: "rounded border border-slate-300 px-3 py-1",
				"data-testid": "edit"
			}, {
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`Edit`);
					else return [createTextVNode("Edit")];
				}),
				_: 1
			}, _parent));
			_push(`<button class="rounded border border-rose-300 px-3 py-1 text-rose-700" data-testid="delete"> Delete </button></div></div><dl class="mt-6 grid max-w-lg grid-cols-3 gap-y-2 text-sm"><dt class="text-slate-500">Status</dt><dd class="col-span-2" data-testid="status">${ssrInterpolate(__props.customer.status)}</dd><dt class="text-slate-500">Notes</dt><dd class="col-span-2 whitespace-pre-line">${ssrInterpolate(__props.customer.notes || "—")}</dd><dt class="text-slate-500">Created</dt><dd class="col-span-2">${ssrInterpolate(__props.customer.created_at)}</dd></dl><p class="mt-8 text-sm">`);
			_push(ssrRenderComponent(unref(BridgeLink), {
				href: "/customers",
				class: "text-indigo-600 hover:underline"
			}, {
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`← Back to customers`);
					else return [createTextVNode("← Back to customers")];
				}),
				_: 1
			}, _parent));
			_push(`</p><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Customers/Show.vue
var _sfc_setup = Show_vue_vue_type_script_setup_true_lang_default.setup;
Show_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Customers/Show.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Show_default = Show_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Show_default as default };
