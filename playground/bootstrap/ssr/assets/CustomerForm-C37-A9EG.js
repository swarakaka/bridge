import { o as useForm } from './AppLayout-i11md3xV.js'
import { defineComponent, mergeProps, unref, useSSRContext } from 'vue'
import {
    ssrIncludeBooleanAttr,
    ssrInterpolate,
    ssrLooseContain,
    ssrLooseEqual,
    ssrRenderAttr,
    ssrRenderAttrs,
    ssrRenderList,
    ssrRenderStyle,
} from 'vue/server-renderer'
//#region resources/js/Components/CustomerForm.vue?vue&type=script&setup=true&lang.ts
var CustomerForm_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
    __name: 'CustomerForm',
    __ssrInlineRender: true,
    props: {
        customer: {},
        statuses: {},
        submitLabel: {},
        action: {},
        method: {},
    },
    setup(__props) {
        const props = __props
        const form = useForm({
            name: props.customer?.name ?? '',
            email: props.customer?.email ?? '',
            company: props.customer?.company ?? '',
            status: props.customer?.status ?? 'active',
            notes: props.customer?.notes ?? '',
            avatar: null,
        })
        return (_ctx, _push, _parent, _attrs) => {
            _push(
                `<form${ssrRenderAttrs(
                    mergeProps(
                        {
                            class: 'space-y-4',
                            'data-testid': 'customer-form',
                        },
                        _attrs,
                    ),
                )}><!--[-->`,
            )
            ssrRenderList(['name', 'email', 'company'], (field) => {
                _push(
                    `<div><label${ssrRenderAttr('for', field)} class="block text-sm font-medium capitalize">${ssrInterpolate(field)}</label><input${ssrRenderAttr('id', field)}${ssrRenderAttr('value', unref(form).data[field])}${ssrRenderAttr('name', field)} type="text" class="mt-1 w-full rounded border border-slate-300 px-3 py-2"${ssrRenderAttr('aria-invalid', Boolean(unref(form).errors[field]))}>`,
                )
                if (unref(form).errors[field])
                    _push(
                        `<p class="mt-1 text-sm text-rose-600"${ssrRenderAttr('data-testid', `error-${field}`)}>${ssrInterpolate(unref(form).errors[field])}</p>`,
                    )
                else _push(`<!---->`)
                _push(`</div>`)
            })
            _push(
                `<!--]--><div><label for="status" class="block text-sm font-medium">Status</label><select id="status" name="status" class="mt-1 rounded border border-slate-300 px-3 py-2"><!--[-->`,
            )
            ssrRenderList(__props.statuses, (status) => {
                _push(
                    `<option${ssrRenderAttr('value', status)}${ssrIncludeBooleanAttr(Array.isArray(unref(form).data.status) ? ssrLooseContain(unref(form).data.status, status) : ssrLooseEqual(unref(form).data.status, status)) ? ' selected' : ''}>${ssrInterpolate(status)}</option>`,
                )
            })
            _push(
                `<!--]--></select></div><div><label for="notes" class="block text-sm font-medium">Notes</label><textarea id="notes" name="notes" rows="3" class="mt-1 w-full rounded border border-slate-300 px-3 py-2">${ssrInterpolate(unref(form).data.notes)}</textarea></div><div><label for="avatar" class="block text-sm font-medium">Avatar (upload with progress)</label><input id="avatar" name="avatar" type="file" accept="image/*" class="mt-1 block text-sm">`,
            )
            if (unref(form).errors.avatar)
                _push(
                    `<p class="mt-1 text-sm text-rose-600" data-testid="error-avatar">${ssrInterpolate(unref(form).errors.avatar)}</p>`,
                )
            else _push(`<!---->`)
            if (unref(form).progress)
                _push(
                    `<div class="mt-2 h-2 w-full rounded bg-slate-200" data-testid="upload-progress"><div class="h-2 rounded bg-indigo-500" style="${ssrRenderStyle({ width: `${unref(form).progress.percentage}%` })}"></div></div>`,
                )
            else _push(`<!---->`)
            _push(
                `</div><div class="flex items-center gap-3"><button type="submit" class="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"${ssrIncludeBooleanAttr(unref(form).processing) ? ' disabled' : ''} data-testid="submit">${ssrInterpolate(unref(form).processing ? 'Saving…' : __props.submitLabel)}</button>`,
            )
            if (unref(form).recentlySuccessful)
                _push(`<span class="text-sm text-emerald-600">Saved.</span>`)
            else _push(`<!---->`)
            if (unref(form).isDirty)
                _push(
                    `<span class="text-xs text-slate-400" data-testid="dirty">Unsaved changes</span>`,
                )
            else _push(`<!---->`)
            _push(`</div></form>`)
        }
    },
})
//#endregion
//#region resources/js/Components/CustomerForm.vue
var _sfc_setup = CustomerForm_vue_vue_type_script_setup_true_lang_default.setup
CustomerForm_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
    const ssrContext = useSSRContext()
    ;(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add(
        'resources/js/Components/CustomerForm.vue',
    )
    return _sfc_setup ? _sfc_setup(props, ctx) : void 0
}
var CustomerForm_default = CustomerForm_vue_vue_type_script_setup_true_lang_default
//#endregion
export { CustomerForm_default as t }
