import { a as BridgeLink, r as BridgeHead, t as AppLayout_default } from "./AppLayout-DGvamj7i.js";
import { createTextVNode, defineComponent, toDisplayString, unref, useSSRContext, withCtx } from "vue";
import { ssrInterpolate, ssrRenderComponent, ssrRenderList } from "vue/server-renderer";
//#region resources/js/Pages/Errors/Index.vue?vue&type=script&setup=true&lang.ts
var Index_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Index",
	__ssrInlineRender: true,
	setup(__props) {
		const cases = [
			{
				status: 401,
				note: "Unauthenticated: page mode navigates to the login page; JSON gets {message}."
			},
			{
				status: 403,
				note: "Forbidden: rendered in place by the resolved error page."
			},
			{
				status: 404,
				note: "Not found: rendered in place."
			},
			{
				status: 419,
				note: "CSRF mismatch: the client performs a full reload to refresh the token."
			},
			{
				status: 500,
				note: "Server error: rendered in place; no stack trace in page mode."
			}
		];
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: "Errors · Bridge" }, null, _parent));
			_push(`<h1 class="text-2xl font-semibold">Errors in every mode</h1><p class="mt-1 text-sm text-slate-500"> Each link triggers the error on the server. Open the same URL with <code>Accept: application/json</code> (JSON demo page) to see the Laravel-native body. </p><ul class="mt-6 space-y-2 text-sm"><!--[-->`);
			ssrRenderList(cases, (c) => {
				_push(`<li class="rounded border border-slate-200 bg-white p-3">`);
				_push(ssrRenderComponent(unref(BridgeLink), {
					href: `/errors/${c.status}`,
					class: "font-medium text-indigo-600 hover:underline",
					"data-testid": `trigger-${c.status}`,
					prefetch: false
				}, {
					default: withCtx((_, _push, _parent, _scopeId) => {
						if (_push) _push(` Trigger ${ssrInterpolate(c.status)}`);
						else return [createTextVNode(" Trigger " + toDisplayString(c.status), 1)];
					}),
					_: 2
				}, _parent));
				_push(`<span class="ml-2 text-slate-500">${ssrInterpolate(c.note)}</span></li>`);
			});
			_push(`<!--]--></ul><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Errors/Index.vue
var _sfc_setup = Index_vue_vue_type_script_setup_true_lang_default.setup;
Index_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Errors/Index.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Index_default = Index_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Index_default as default };
