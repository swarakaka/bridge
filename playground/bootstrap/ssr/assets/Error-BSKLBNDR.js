import { a as BridgeLink, t as AppLayout_default } from "./AppLayout-DGvamj7i.js";
import { createTextVNode, defineComponent, mergeProps, unref, useSSRContext, withCtx } from "vue";
import { ssrInterpolate, ssrRenderAttrs, ssrRenderComponent } from "vue/server-renderer";
//#region resources/js/Pages/Errors/Error.vue?vue&type=script&setup=true&lang.ts
var Error_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Error",
	__ssrInlineRender: true,
	props: {
		status: {},
		kind: {},
		message: {}
	},
	setup(__props) {
		const props = __props;
		const title = {
			403: "Forbidden",
			404: "Page not found",
			419: "Page expired",
			429: "Too many requests",
			500: "Server error",
			503: "Service unavailable"
		}[props.status] ?? `Error ${props.status}`;
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<div${ssrRenderAttrs(mergeProps({
				class: "mx-auto max-w-lg py-16 text-center",
				"data-testid": "error-page",
				"data-status": __props.status
			}, _attrs))}><div class="text-6xl font-bold text-slate-300">${ssrInterpolate(__props.status)}</div><h1 class="mt-2 text-2xl font-semibold">${ssrInterpolate(unref(title))}</h1><p class="mt-2 text-slate-500" data-testid="error-message">${ssrInterpolate(__props.message)}</p><p class="mt-6 text-sm">`);
			_push(ssrRenderComponent(unref(BridgeLink), {
				href: "/",
				class: "text-indigo-600 hover:underline"
			}, {
				default: withCtx((_, _push, _parent, _scopeId) => {
					if (_push) _push(`Back to the dashboard`);
					else return [createTextVNode("Back to the dashboard")];
				}),
				_: 1
			}, _parent));
			_push(`</p></div>`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Errors/Error.vue
var _sfc_setup = Error_vue_vue_type_script_setup_true_lang_default.setup;
Error_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Errors/Error.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Error_default = Error_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Error_default as default };
