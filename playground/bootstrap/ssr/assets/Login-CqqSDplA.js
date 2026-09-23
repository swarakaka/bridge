import { r as BridgeHead, s as useForm, t as AppLayout_default } from "./AppLayout-DGvamj7i.js";
import { defineComponent, unref, useSSRContext } from "vue";
import { ssrIncludeBooleanAttr, ssrInterpolate, ssrLooseContain, ssrRenderAttr, ssrRenderComponent } from "vue/server-renderer";
//#region resources/js/Pages/Auth/Login.vue?vue&type=script&setup=true&lang.ts
var Login_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Login",
	__ssrInlineRender: true,
	props: { hint: {} },
	setup(__props) {
		const form = useForm({
			email: __props.hint.email,
			password: "",
			remember: false
		});
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: "Sign in · Bridge" }, null, _parent));
			_push(`<div class="mx-auto max-w-sm"><h1 class="text-2xl font-semibold">Sign in</h1><p class="mt-1 text-sm text-slate-500"> Seeded user: ${ssrInterpolate(__props.hint.email)} / ${ssrInterpolate(__props.hint.password)}</p><form class="mt-6 space-y-4" data-testid="login-form"><div><label for="email" class="block text-sm font-medium">Email</label><input id="email"${ssrRenderAttr("value", unref(form).data.email)} name="email" type="email" class="mt-1 w-full rounded border border-slate-300 px-3 py-2">`);
			if (unref(form).errors.email) _push(`<p class="mt-1 text-sm text-rose-600" data-testid="error-email">${ssrInterpolate(unref(form).errors.email)}</p>`);
			else _push(`<!---->`);
			_push(`</div><div><label for="password" class="block text-sm font-medium">Password</label><input id="password"${ssrRenderAttr("value", unref(form).data.password)} name="password" type="password" class="mt-1 w-full rounded border border-slate-300 px-3 py-2">`);
			if (unref(form).errors.password) _push(`<p class="mt-1 text-sm text-rose-600" data-testid="error-password">${ssrInterpolate(unref(form).errors.password)}</p>`);
			else _push(`<!---->`);
			_push(`</div><label class="flex items-center gap-2 text-sm"><input${ssrIncludeBooleanAttr(Array.isArray(unref(form).data.remember) ? ssrLooseContain(unref(form).data.remember, null) : unref(form).data.remember) ? " checked" : ""} type="checkbox"> Remember me</label><button type="submit" class="w-full rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"${ssrIncludeBooleanAttr(unref(form).processing) ? " disabled" : ""} data-testid="submit"> Sign in </button></form></div><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Auth/Login.vue
var _sfc_setup = Login_vue_vue_type_script_setup_true_lang_default.setup;
Login_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Auth/Login.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Login_default = Login_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Login_default as default };
