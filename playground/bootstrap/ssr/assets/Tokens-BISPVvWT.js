import { a as BridgeLink, r as BridgeHead, s as useForm, t as AppLayout_default } from "./AppLayout-DGvamj7i.js";
import { createTextVNode, defineComponent, unref, useSSRContext, withCtx } from "vue";
import { ssrIncludeBooleanAttr, ssrInterpolate, ssrRenderAttr, ssrRenderComponent, ssrRenderList } from "vue/server-renderer";
//#region resources/js/Pages/Auth/Tokens.vue?vue&type=script&setup=true&lang.ts
var Tokens_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Tokens",
	__ssrInlineRender: true,
	props: {
		tokens: {},
		plainTextToken: {}
	},
	setup(__props) {
		const form = useForm({ name: "mobile-demo" });
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: "API tokens · Bridge" }, null, _parent));
			_push(`<h1 class="text-2xl font-semibold">API tokens</h1><p class="mt-1 text-sm text-slate-500"> Sanctum personal access tokens. Use one as <code>Authorization: Bearer …</code> against the same routes; the JSON demo page can use it too. </p>`);
			if (__props.plainTextToken) _push(`<div class="mt-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm" data-testid="plain-token"><div class="font-medium">Your new token (shown once):</div><code class="block break-all">${ssrInterpolate(__props.plainTextToken)}</code></div>`);
			else _push(`<!---->`);
			_push(`<form class="mt-6 flex items-end gap-2" data-testid="token-form"><div><label for="name" class="block text-sm font-medium">Token name</label><input id="name"${ssrRenderAttr("value", unref(form).data.name)} name="name" class="mt-1 rounded border border-slate-300 px-3 py-2">`);
			if (unref(form).errors.name) _push(`<p class="text-sm text-rose-600">${ssrInterpolate(unref(form).errors.name)}</p>`);
			else _push(`<!---->`);
			_push(`</div><button type="submit" class="rounded bg-indigo-600 px-3 py-2 text-sm text-white"${ssrIncludeBooleanAttr(unref(form).processing) ? " disabled" : ""}> Create token </button></form><table class="mt-6 w-full text-sm" data-testid="tokens-table"><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-2">Name</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody class="divide-y divide-slate-200 bg-white"><!--[-->`);
			ssrRenderList(__props.tokens, (token) => {
				_push(`<tr><td class="py-2">${ssrInterpolate(token.name)}</td><td>${ssrInterpolate(token.created_at)}</td><td>${ssrInterpolate(token.last_used_at ?? "never")}</td><td class="text-right">`);
				_push(ssrRenderComponent(unref(BridgeLink), {
					href: `/tokens/${token.id}`,
					method: "delete",
					as: "button",
					class: "text-rose-600 hover:underline"
				}, {
					default: withCtx((_, _push, _parent, _scopeId) => {
						if (_push) _push(`Revoke`);
						else return [createTextVNode("Revoke")];
					}),
					_: 2
				}, _parent));
				_push(`</td></tr>`);
			});
			_push(`<!--]-->`);
			if (__props.tokens.length === 0) _push(`<tr><td colspan="4" class="py-4 text-center text-slate-400">No tokens yet.</td></tr>`);
			else _push(`<!---->`);
			_push(`</tbody></table><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Auth/Tokens.vue
var _sfc_setup = Tokens_vue_vue_type_script_setup_true_lang_default.setup;
Tokens_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Auth/Tokens.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Tokens_default = Tokens_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Tokens_default as default };
