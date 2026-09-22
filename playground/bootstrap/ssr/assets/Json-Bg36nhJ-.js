import { r as BridgeHead, t as AppLayout_default } from './AppLayout-i11md3xV.js'
import { computed, defineComponent, ref, unref, useSSRContext } from 'vue'
import {
    ssrIncludeBooleanAttr,
    ssrInterpolate,
    ssrLooseContain,
    ssrLooseEqual,
    ssrRenderAttr,
    ssrRenderComponent,
    ssrRenderList,
} from 'vue/server-renderer'
//#region resources/js/Pages/Json.vue?vue&type=script&setup=true&lang.ts
var Json_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
    layout: AppLayout_default,
    __name: 'Json',
    __ssrInlineRender: true,
    props: {
        endpoints: {},
        accepts: {},
    },
    setup(__props) {
        const props = __props
        const selected = ref(0)
        const accept = ref(props.accepts[0] ?? 'application/json')
        const token = ref('')
        const body = ref('{"name": "Initech", "email": "it@initech.test"}')
        const result = ref(null)
        const running = ref(false)
        const endpoint = computed(() => props.endpoints[selected.value])
        const curl = computed(() => {
            const parts = ['curl -i', `-H 'Accept: ${accept.value}'`]
            if (token.value) parts.push(`-H 'Authorization: Bearer ${token.value}'`)
            if (endpoint.value.method !== 'GET')
                parts.push(
                    `-X ${endpoint.value.method}`,
                    `-H 'Content-Type: application/json'`,
                    `-d '${body.value}'`,
                )
            parts.push(
                `${typeof window === 'undefined' ? '' : window.location.origin}${endpoint.value.path}`,
            )
            return parts.join(' \\\n  ')
        })
        return (_ctx, _push, _parent, _attrs) => {
            _push(`<!--[-->`)
            _push(
                ssrRenderComponent(
                    unref(BridgeHead),
                    { title: 'JSON demo · Bridge' },
                    null,
                    _parent,
                ),
            )
            _push(
                `<h1 class="text-2xl font-semibold">Same route, different <code>Accept</code></h1><p class="mt-1 text-sm text-slate-500"> Every request below hits the same Laravel controller that renders this SPA. Only the <code>Accept</code> header changes. Customers routes need a session (sign in) or a bearer token from the Tokens page. </p><div class="mt-6 grid gap-4 md:grid-cols-2"><div class="space-y-3 text-sm"><label class="block"><span class="font-medium">Endpoint</span><select class="mt-1 w-full rounded border border-slate-300 px-3 py-2" data-testid="endpoint"><!--[-->`,
            )
            ssrRenderList(__props.endpoints, (item, i) => {
                _push(
                    `<option${ssrRenderAttr('value', i)}${ssrIncludeBooleanAttr(Array.isArray(selected.value) ? ssrLooseContain(selected.value, i) : ssrLooseEqual(selected.value, i)) ? ' selected' : ''}>${ssrInterpolate(item.method)} ${ssrInterpolate(item.path)} — ${ssrInterpolate(item.label)}</option>`,
                )
            })
            _push(
                `<!--]--></select></label><label class="block"><span class="font-medium">Accept</span><select class="mt-1 w-full rounded border border-slate-300 px-3 py-2" data-testid="accept"><!--[-->`,
            )
            ssrRenderList(__props.accepts, (type) => {
                _push(
                    `<option${ssrRenderAttr('value', type)}${ssrIncludeBooleanAttr(Array.isArray(accept.value) ? ssrLooseContain(accept.value, type) : ssrLooseEqual(accept.value, type)) ? ' selected' : ''}>${ssrInterpolate(type)}</option>`,
                )
            })
            _push(
                `<!--]--></select></label><label class="block"><span class="font-medium">Bearer token (optional)</span><input${ssrRenderAttr('value', token.value)} class="mt-1 w-full rounded border border-slate-300 px-3 py-2" placeholder="from /tokens" data-testid="token"></label>`,
            )
            if (endpoint.value.method !== 'GET')
                _push(
                    `<label class="block"><span class="font-medium">JSON body</span><textarea rows="3" class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs" data-testid="body">${ssrInterpolate(body.value)}</textarea></label>`,
                )
            else _push(`<!---->`)
            _push(
                `<button class="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"${ssrIncludeBooleanAttr(running.value) ? ' disabled' : ''} data-testid="run"> Send </button><pre class="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100" data-testid="curl">${ssrInterpolate(curl.value)}</pre></div>`,
            )
            if (result.value) {
                _push(
                    `<div class="text-sm" data-testid="result"><div class="font-medium"> HTTP <span data-testid="result-status">${ssrInterpolate(result.value.status)}</span></div><ul class="mt-1 text-xs text-slate-500" data-testid="result-headers"><!--[-->`,
                )
                ssrRenderList(result.value.headers, ([name, value]) => {
                    _push(`<li><b>${ssrInterpolate(name)}</b>: ${ssrInterpolate(value)}</li>`)
                })
                _push(
                    `<!--]--></ul><pre class="mt-2 max-h-[28rem] overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100" data-testid="result-body">${ssrInterpolate(result.value.body)}</pre></div>`,
                )
            } else _push(`<!---->`)
            _push(`</div><!--]-->`)
        }
    },
})
//#endregion
//#region resources/js/Pages/Json.vue
var _sfc_setup = Json_vue_vue_type_script_setup_true_lang_default.setup
Json_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
    const ssrContext = useSSRContext()
    ;(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add(
        'resources/js/Pages/Json.vue',
    )
    return _sfc_setup ? _sfc_setup(props, ctx) : void 0
}
var Json_default = Json_vue_vue_type_script_setup_true_lang_default
//#endregion
export { Json_default as default }
