import { c as useProp, n as useAppStream, o as useForm, r as BridgeHead, t as AppLayout_default } from "./AppLayout-BzYPQJMZ.js";
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, unref, useSSRContext } from "vue";
import { ssrIncludeBooleanAttr, ssrInterpolate, ssrLooseContain, ssrLooseEqual, ssrRenderAttr, ssrRenderClass, ssrRenderComponent, ssrRenderList, ssrRenderStyle } from "vue/server-renderer";
//#region resources/js/Pages/Realtime.vue?vue&type=script&setup=true&lang.ts
var Realtime_vue_vue_type_script_setup_true_lang_default = /*@__PURE__*/ defineComponent({
	layout: AppLayout_default,
	__name: "Realtime",
	__ssrInlineRender: true,
	props: {
		customersCount: {},
		unreadCount: {},
		channels: {},
		heartbeatMs: {},
		maxDurationS: {},
		driver: {}
	},
	setup(__props) {
		const stream = useAppStream();
		const unread = useProp("unreadCount", 0);
		const count = useProp("customersCount", 0);
		const log = ref([]);
		const push = (kind, name, detail) => {
			log.value.unshift({
				at: (/* @__PURE__ */ new Date()).toLocaleTimeString(),
				kind,
				name,
				detail: typeof detail === "string" ? detail : JSON.stringify(detail)
			});
			if (log.value.length > 50) log.value.pop();
		};
		const offs = [];
		if (stream) {
			offs.push(stream.on("*", (e) => push(e.control ? "control" : "event", e.control ? `bridge:${e.data.type}` : e.name, e.data)));
			offs.push(stream.on("state", (s) => push("local", "state", s)));
			offs.push(stream.on("heartbeat", () => push("local", "heartbeat", "hb")));
		}
		onBeforeUnmount(() => offs.forEach((off) => off()));
		const now = ref(Date.now());
		let tick = null;
		onMounted(() => tick = setInterval(() => now.value = Date.now(), 500));
		onBeforeUnmount(() => tick && clearInterval(tick));
		const sinceLast = computed(() => stream?.lastEventAt.value ? Math.round((now.value - stream.lastEventAt.value) / 1e3) : null);
		const notify = useForm({
			message: "Hello from the server",
			level: "success"
		});
		const broadcast = useForm({ message: "Everyone sees this" });
		const exportProgress = ref(null);
		const exportRows = ref(null);
		const stateColor = {
			open: "bg-emerald-500",
			connecting: "bg-amber-500",
			reconnecting: "bg-amber-500",
			closed: "bg-slate-400",
			idle: "bg-slate-400"
		};
		return (_ctx, _push, _parent, _attrs) => {
			_push(`<!--[-->`);
			_push(ssrRenderComponent(unref(BridgeHead), { title: "Realtime · Bridge" }, null, _parent));
			_push(`<h1 class="text-2xl font-semibold">Realtime</h1><p class="mt-1 text-sm text-slate-500"> One SSE stream per signed-in user (bus driver: <code>${ssrInterpolate(__props.driver)}</code>, heartbeat ${ssrInterpolate(__props.heartbeatMs / 1e3)}s, max duration ${ssrInterpolate(__props.maxDurationS)}s, then a transparent reconnect). Channels: <!--[-->`);
			ssrRenderList(__props.channels, (c) => {
				_push(`<code class="mr-1">${ssrInterpolate(c)}</code>`);
			});
			_push(`<!--]--></p><section class="mt-6 grid gap-4 sm:grid-cols-4" data-testid="status"><div class="rounded border border-slate-200 bg-white p-3"><div class="text-xs uppercase text-slate-500">Connection</div><div class="mt-1 flex items-center gap-2"><span class="${ssrRenderClass([stateColor[unref(stream)?.state.value ?? "idle"], "inline-block h-2.5 w-2.5 rounded-full"])}"></span><span data-testid="stream-state">${ssrInterpolate(unref(stream)?.state.value ?? "no stream")}</span></div></div><div class="rounded border border-slate-200 bg-white p-3"><div class="text-xs uppercase text-slate-500">Last heartbeat/event</div><div class="mt-1" data-testid="since-last">${ssrInterpolate(sinceLast.value === null ? "—" : `${sinceLast.value}s ago`)}</div></div><div class="rounded border border-slate-200 bg-white p-3"><div class="text-xs uppercase text-slate-500">Reconnects</div><div class="mt-1" data-testid="reconnects">${ssrInterpolate(unref(stream)?.reconnectAttempts.value ?? 0)}</div></div><div class="rounded border border-slate-200 bg-white p-3"><div class="text-xs uppercase text-slate-500">Customers (invalidated live)</div><div class="mt-1 text-xl font-semibold" data-testid="customers-count">${ssrInterpolate(unref(count))}</div></div></section><section class="mt-6 grid gap-6 md:grid-cols-2"><div class="space-y-4"><h2 class="font-medium">Triggers</h2><form class="flex gap-2" data-testid="notify-form"><input${ssrRenderAttr("value", unref(notify).data.message)} class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"><select class="rounded border border-slate-300 px-2 py-1 text-sm"><!--[-->`);
			ssrRenderList([
				"info",
				"success",
				"warning",
				"error"
			], (l) => {
				_push(`<option${ssrRenderAttr("value", l)}${ssrIncludeBooleanAttr(Array.isArray(unref(notify).data.level) ? ssrLooseContain(unref(notify).data.level, l) : ssrLooseEqual(unref(notify).data.level, l)) ? " selected" : ""}>${ssrInterpolate(l)}</option>`);
			});
			_push(`<!--]--></select><button class="rounded bg-indigo-600 px-3 py-1 text-sm text-white" data-testid="send-notification"> Notify me </button></form><form class="flex gap-2" data-testid="broadcast-form"><input${ssrRenderAttr("value", unref(broadcast).data.message)} class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"><button class="rounded bg-indigo-600 px-3 py-1 text-sm text-white" data-testid="send-broadcast"> Notify everyone </button></form><div class="flex flex-wrap gap-2 text-sm"><button class="rounded border border-slate-300 px-3 py-1" data-testid="push-prop"> Push prop <code>unreadCount</code> (now ${ssrInterpolate(unref(unread))}) </button><button class="rounded border border-slate-300 px-3 py-1" data-testid="invalidate"> Invalidate customers </button><button class="rounded border border-rose-300 px-3 py-1 text-rose-700" data-testid="end-connection"> End connection (server) </button><button class="rounded border border-slate-300 px-3 py-1" data-testid="run-export"> Run export (producer stream) </button></div>`);
			if (exportProgress.value) {
				_push(`<div class="text-sm" data-testid="export"><div class="h-2 w-full rounded bg-slate-200"><div class="h-2 rounded bg-indigo-500" style="${ssrRenderStyle({ width: `${exportProgress.value.value * 100}%` })}"></div></div><div class="mt-1 text-slate-500">${ssrInterpolate(exportProgress.value.label)} `);
				if (exportRows.value !== null) _push(`<span data-testid="export-rows">— done, ${ssrInterpolate(exportRows.value)} rows</span>`);
				else _push(`<!---->`);
				_push(`</div></div>`);
			} else _push(`<!---->`);
			_push(`<p class="text-xs text-slate-400"> Open this page in a second browser, create a customer there, and watch the customers count and the event log here. </p></div><div><h2 class="font-medium">Event log</h2><ul class="mt-2 max-h-96 overflow-auto rounded border border-slate-200 bg-white text-xs" data-testid="event-log"><!--[-->`);
			ssrRenderList(log.value, (entry, i) => {
				_push(`<li class="flex gap-2 border-b border-slate-100 px-2 py-1"${ssrRenderAttr("data-kind", entry.kind)}${ssrRenderAttr("data-name", entry.name)}><span class="text-slate-400">${ssrInterpolate(entry.at)}</span><span class="${ssrRenderClass([entry.kind === "control" ? "text-indigo-600" : entry.kind === "event" ? "text-emerald-700" : "text-slate-500", "w-36 shrink-0 font-medium"])}">${ssrInterpolate(entry.name)}</span><span class="truncate text-slate-600">${ssrInterpolate(entry.detail)}</span></li>`);
			});
			_push(`<!--]-->`);
			if (log.value.length === 0) _push(`<li class="px-2 py-4 text-center text-slate-400"> Waiting for events… </li>`);
			else _push(`<!---->`);
			_push(`</ul></div></section><!--]-->`);
		};
	}
});
//#endregion
//#region resources/js/Pages/Realtime.vue
var _sfc_setup = Realtime_vue_vue_type_script_setup_true_lang_default.setup;
Realtime_vue_vue_type_script_setup_true_lang_default.setup = (props, ctx) => {
	const ssrContext = useSSRContext();
	(ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("resources/js/Pages/Realtime.vue");
	return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
var Realtime_default = Realtime_vue_vue_type_script_setup_true_lang_default;
//#endregion
export { Realtime_default as default };
