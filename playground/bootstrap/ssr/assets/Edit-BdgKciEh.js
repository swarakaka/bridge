import { r as BridgeHead, t as AppLayout_default } from "./AppLayout-BzYPQJMZ.js";
import { t as CustomerForm_default } from "./CustomerForm-B_juC4zm.js";
import { defineComponent, unref, useSSRContext } from "vue";
import { ssrInterpolate, ssrRenderComponent } from "vue/server-renderer";
//#region resources/js/Pages/Customers/Edit.vue?vue&type=script&setup=true&lang.ts
var Edit_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Edit",
	__ssrInlineRender: true,
	props: {
		customer: {},
		statuses: {}
	},
	setup(__props) {
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: `Edit ${__props.customer.name} · Bridge` }, null, _parent));
			_push(`<h1 class="text-2xl font-semibold">Edit ${ssrInterpolate(__props.customer.name)}</h1><div class="mt-6 max-w-lg">`);
			_push(ssrRenderComponent(CustomerForm_default, {
				customer: __props.customer,
				statuses: __props.statuses,
				action: `/customers/${__props.customer.id}`,
				method: "put",
				"submit-label": "Save changes"
			}, null, _parent));
			_push(`</div><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Customers/Edit.vue
var _sfc_setup = Edit_vue_vue_type_script_setup_true_lang_default.setup;
Edit_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Customers/Edit.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Edit_default = Edit_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Edit_default as default };
