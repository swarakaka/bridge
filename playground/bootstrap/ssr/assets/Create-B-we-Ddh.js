import { r as BridgeHead, t as AppLayout_default } from "./AppLayout-B-H39FZD.js";
import { t as CustomerForm_default } from "./CustomerForm-5WWT3CWF.js";
import { defineComponent, unref, useSSRContext } from "vue";
import { ssrRenderComponent } from "vue/server-renderer";
//#region resources/js/Pages/Customers/Create.vue?vue&type=script&setup=true&lang.ts
var Create_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Create",
	__ssrInlineRender: true,
	props: { statuses: {} },
	setup(__props) {
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: "New customer · Bridge" }, null, _parent));
			_push(`<h1 class="text-2xl font-semibold">New customer</h1><div class="mt-6 max-w-lg">`);
			_push(ssrRenderComponent(CustomerForm_default, {
				statuses: __props.statuses,
				action: "/customers",
				method: "post",
				"submit-label": "Create customer"
			}, null, _parent));
			_push(`</div><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Customers/Create.vue
var _sfc_setup = Create_vue_vue_type_script_setup_true_lang_default.setup;
Create_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Customers/Create.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Create_default = Create_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Create_default as default };
