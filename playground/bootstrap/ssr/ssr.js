import { createSSRApp, defineComponent, h, inject, shallowRef } from "vue";
import { renderToString } from "vue/server-renderer";
//#region ../packages/core/dist/cache/PageCache.js
/** Small LRU used by prefetch and instant back-navigation. */
var PageCache = class {
	entries = /* @__PURE__ */ new Map();
	ttl;
	swr;
	max;
	now;
	constructor(options = {}) {
		this.ttl = options.ttl ?? 3e4;
		this.swr = options.staleWhileRevalidate ?? 3e4;
		this.max = options.max ?? 50;
		this.now = options.now ?? (() => Date.now());
	}
	static key(url, only, except) {
		return `${url}${only && only.length ? `|only=${[...only].sort().join(",")}` : ""}${except && except.length ? `|except=${[...except].sort().join(",")}` : ""}`;
	}
	get(key) {
		const entry = this.entries.get(key);
		if (!entry) return { state: "miss" };
		const age = this.now() - entry.fetchedAt;
		if (age <= this.ttl) {
			this.touch(key, entry);
			return {
				state: "fresh",
				entry
			};
		}
		if (age <= this.ttl + this.swr) {
			this.touch(key, entry);
			return {
				state: "stale",
				entry
			};
		}
		this.entries.delete(key);
		return { state: "miss" };
	}
	set(key, page) {
		this.entries.delete(key);
		this.entries.set(key, {
			page,
			fetchedAt: this.now()
		});
		while (this.entries.size > this.max) {
			const oldest = this.entries.keys().next().value;
			if (oldest === void 0) break;
			this.entries.delete(oldest);
		}
	}
	delete(key) {
		this.entries.delete(key);
	}
	clear() {
		this.entries.clear();
	}
	get size() {
		return this.entries.size;
	}
	touch(key, entry) {
		this.entries.delete(key);
		this.entries.set(key, entry);
	}
};
//#endregion
//#region ../packages/core/dist/config.js
var DEFAULT_CONFIG = {
	cache: {
		ttl: 3e4,
		staleWhileRevalidate: 3e4
	},
	reloadDebounce: 50,
	hardReloadOnError: false,
	allowExternalNavigate: false
};
var MEDIA_TYPES = {
	page: "application/vnd.bridge+json",
	json: "application/json",
	stream: "text/event-stream",
	html: "text/html"
};
/** The `Accept` value a page-mode client sends. */
var PAGE_ACCEPT = `${MEDIA_TYPES.page}; v=1`;
var HEADERS = {
	build: "X-Bridge-Build",
	only: "X-Bridge-Only",
	except: "X-Bridge-Except",
	component: "X-Bridge-Component",
	location: "X-Bridge-Location",
	lastEventId: "Last-Event-ID"
};
/** Reserved SSE event name for control events. */
var CONTROL_EVENT = "bridge";
/** Element id of the embedded page object in an HTML shell. */
var EMBEDDED_PAGE_ID = "bridge-page";
function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPage(value) {
	return isObject(value) && value.type === "page" && typeof value.component === "string" && typeof value.url === "string" && isObject(value.props);
}
function isError(value) {
	return isObject(value) && value.type === "error" && isObject(value.error);
}
function isControlEvent(value) {
	return isObject(value) && typeof value.type === "string";
}
/** Parses the `v` parameter of a Bridge media type; `null` when the type is not Bridge's. */
function parseBridgeContentType(contentType) {
	if (!contentType) return null;
	const [type, ...params] = contentType.split(";").map((s) => s.trim());
	if (type?.toLowerCase() !== MEDIA_TYPES.page) return null;
	for (const p of params) {
		const [k, v] = p.split("=").map((s) => s.trim());
		if (k?.toLowerCase() === "v" && v && /^\d+$/.test(v)) return Number(v);
	}
	return 1;
}
//#endregion
//#region ../packages/core/dist/dom.js
/** Reads the page object embedded by the HTML shell (spec/page.md §2). */
function readEmbeddedPage(doc = document) {
	const el = doc.getElementById(EMBEDDED_PAGE_ID);
	if (!el || !el.textContent) return null;
	try {
		const parsed = JSON.parse(el.textContent);
		return isPage(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
function readMeta(name, doc = document) {
	return doc.querySelector(`meta[name="${name}"]`)?.content ?? null;
}
function readBuild(doc = document) {
	return readMeta("bridge-build", doc);
}
//#endregion
//#region ../packages/core/dist/events/Emitter.js
var Emitter = class {
	listeners = /* @__PURE__ */ new Map();
	on(event, listener) {
		let set = this.listeners.get(event);
		if (!set) {
			set = /* @__PURE__ */ new Set();
			this.listeners.set(event, set);
		}
		set.add(listener);
		return () => this.off(event, listener);
	}
	once(event, listener) {
		const off = this.on(event, (payload) => {
			off();
			return listener(payload);
		});
		return off;
	}
	off(event, listener) {
		this.listeners.get(event)?.delete(listener);
	}
	/** Returns false when any listener returned false. */
	emit(event, payload) {
		const set = this.listeners.get(event);
		if (!set) return true;
		let ok = true;
		for (const listener of Array.from(set)) if (listener(payload) === false) ok = false;
		return ok;
	}
	count(event) {
		return this.listeners.get(event)?.size ?? 0;
	}
	clear() {
		this.listeners.clear();
	}
};
//#endregion
//#region ../packages/core/dist/forms/createForm.js
/**
* Form state machine (PLAN §14). Framework adapters wrap the instance in
* their reactivity system; all mutations go through `this` so proxies work.
*/
var Form = class {
	router;
	data;
	defaults;
	/** First message per field. */
	errors = {};
	/** All messages per field, as the server sent them. */
	allErrors = {};
	processing = false;
	progress = null;
	wasSuccessful = false;
	recentlySuccessful = false;
	lastError = null;
	transformer = (data) => data;
	recentlyTimer = null;
	cancelFn = null;
	options;
	constructor(router, initial, options = {}) {
		this.router = router;
		this.data = clone(initial);
		this.defaults = clone(initial);
		this.options = options;
	}
	get isDirty() {
		return JSON.stringify(this.data) !== JSON.stringify(this.defaults);
	}
	get hasErrors() {
		return Object.keys(this.errors).length > 0;
	}
	setData(keyOrValues, value) {
		if (typeof keyOrValues === "object") Object.assign(this.data, keyOrValues);
		else this.data[keyOrValues] = value;
		return this;
	}
	transform(fn) {
		this.transformer = fn;
		return this;
	}
	setDefaults(values) {
		this.defaults = values ? {
			...clone(this.data),
			...values
		} : clone(this.data);
		return this;
	}
	reset(...fields) {
		if (fields.length === 0) this.data = clone(this.defaults);
		else for (const field of fields) this.data[field] = clone(this.defaults[field]);
		return this;
	}
	setError(fieldOrErrors, message) {
		if (typeof fieldOrErrors === "string") {
			this.errors = {
				...this.errors,
				[fieldOrErrors]: message ?? ""
			};
			this.allErrors = {
				...this.allErrors,
				[fieldOrErrors]: [message ?? ""]
			};
		} else {
			const flat = {};
			const all = {};
			for (const [key, value] of Object.entries(fieldOrErrors)) {
				const list = Array.isArray(value) ? value : [value];
				flat[key] = list[0] ?? "";
				all[key] = list;
			}
			this.errors = {
				...this.errors,
				...flat
			};
			this.allErrors = {
				...this.allErrors,
				...all
			};
		}
		return this;
	}
	clearErrors(...fields) {
		if (fields.length === 0) {
			this.errors = {};
			this.allErrors = {};
			return this;
		}
		const errors = { ...this.errors };
		const all = { ...this.allErrors };
		for (const field of fields) {
			delete errors[field];
			delete all[field];
		}
		this.errors = errors;
		this.allErrors = all;
		return this;
	}
	async submit(method, url, options = {}) {
		const data = this.transformer(this.data);
		this.processing = true;
		this.progress = null;
		this.wasSuccessful = false;
		this.recentlySuccessful = false;
		this.lastError = null;
		if (this.recentlyTimer) clearTimeout(this.recentlyTimer);
		const outcome = await this.router.visit(url, {
			...options,
			method,
			data,
			forceFormData: options.forceFormData,
			onBefore: (visit) => {
				this.cancelFn = () => this.router.cancel();
				return options.onBefore?.(visit);
			},
			onProgress: (progress) => {
				this.progress = progress;
				options.onProgress?.(progress);
			},
			onInvalid: (errors, error) => {
				this.setErrorsFromServer(errors);
				this.lastError = error;
				options.onInvalid?.(errors, error);
			},
			onError: (error) => {
				this.lastError = error;
				options.onError?.(error);
			},
			onSuccess: (page) => {
				this.clearErrors();
				this.wasSuccessful = true;
				this.recentlySuccessful = true;
				this.recentlyTimer = setTimeout(() => {
					this.recentlySuccessful = false;
				}, this.options.recentlySuccessfulFor ?? 2e3);
				if (options.resetOnSuccess ?? this.options.resetOnSuccess) this.reset();
				else this.setDefaults();
				options.onSuccess?.(page);
			},
			onFinish: (visit) => {
				this.processing = false;
				this.progress = null;
				this.cancelFn = null;
				options.onFinish?.(visit);
			}
		});
		if (outcome.status === "redirected") return outcome;
		return outcome;
	}
	get(url, options) {
		return this.submit("get", url, options);
	}
	post(url, options) {
		return this.submit("post", url, options);
	}
	put(url, options) {
		return this.submit("put", url, options);
	}
	patch(url, options) {
		return this.submit("patch", url, options);
	}
	delete(url, options) {
		return this.submit("delete", url, options);
	}
	cancel() {
		this.cancelFn?.();
	}
	validating = false;
	/**
	* Validate through Laravel Precognition without running the controller.
	* With fields, only those rules run and only their errors change; a 204
	* clears them. The route needs the `precognitive` middleware.
	*/
	async validate(method, url, fields = [], options = {}) {
		const only = Array.isArray(fields) ? fields : [fields];
		const headers = {
			...options.headers ?? {},
			Precognition: "true"
		};
		if (only.length > 0) headers["Precognition-Validate-Only"] = only.join(",");
		this.validating = true;
		return this.router.visit(url, {
			...options,
			method,
			data: this.transformer(this.data),
			headers,
			preserveState: true,
			preserveScroll: true,
			useCache: false,
			onInvalid: (errors, error) => {
				const scoped = only.length > 0 ? Object.fromEntries(Object.entries(errors).filter(([k]) => only.includes(k))) : errors;
				if (only.length > 0) this.clearErrors(...only);
				else this.clearErrors();
				this.setError(scoped);
				this.lastError = error;
				options.onInvalid?.(errors, error);
			},
			onSuccess: (page) => {
				if (only.length > 0) this.clearErrors(...only);
				else this.clearErrors();
				options.onSuccess?.(page);
			},
			onFinish: (visit) => {
				this.validating = false;
				options.onFinish?.(visit);
			}
		});
	}
	setErrorsFromServer(errors) {
		const flat = {};
		for (const [key, messages] of Object.entries(errors)) flat[key] = messages[0] ?? "";
		this.errors = flat;
		this.allErrors = { ...errors };
	}
};
function clone(value) {
	if (typeof structuredClone === "function") try {
		return structuredClone(value);
	} catch {}
	if (Array.isArray(value)) return value.map(clone);
	if (value && typeof value === "object" && !(value instanceof File) && !(value instanceof Blob) && !(value instanceof Date)) {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = clone(v);
		return out;
	}
	return value;
}
//#endregion
//#region ../packages/core/dist/http/csrf.js
/** Reads Laravel's XSRF-TOKEN cookie (URL-encoded) for the X-XSRF-TOKEN header. */
function readXsrfToken(cookieString = typeof document === "undefined" ? "" : document.cookie) {
	for (const part of cookieString.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === "XSRF-TOKEN") {
			const value = rest.join("=");
			try {
				return decodeURIComponent(value);
			} catch {
				return value;
			}
		}
	}
	return null;
}
//#endregion
//#region ../packages/core/dist/http/formData.js
function isFile(value) {
	return typeof File !== "undefined" && value instanceof File || typeof Blob !== "undefined" && value instanceof Blob || typeof FileList !== "undefined" && value instanceof FileList;
}
/** True when the data contains a File, Blob or FileList at any depth. */
function hasFiles(data) {
	if (data instanceof FormData) {
		for (const [, value] of data.entries()) if (typeof value !== "string") return true;
		return false;
	}
	if (isFile(data)) return true;
	if (Array.isArray(data)) return data.some(hasFiles);
	if (data && typeof data === "object") return Object.values(data).some(hasFiles);
	return false;
}
/** Flattens nested data into FormData using Laravel's bracket notation (a[b][0]). */
function objectToFormData(data, form = new FormData(), parentKey = null) {
	for (const [key, value] of Object.entries(data)) append(form, parentKey ? `${parentKey}[${key}]` : key, value);
	return form;
}
function append(form, key, value) {
	if (value === void 0) return;
	if (value === null) {
		form.append(key, "");
		return;
	}
	if (typeof FileList !== "undefined" && value instanceof FileList) {
		Array.from(value).forEach((file, i) => form.append(`${key}[${i}]`, file));
		return;
	}
	if (typeof File !== "undefined" && value instanceof File) {
		form.append(key, value, value.name);
		return;
	}
	if (typeof Blob !== "undefined" && value instanceof Blob) {
		form.append(key, value);
		return;
	}
	if (typeof value === "boolean") {
		form.append(key, value ? "1" : "0");
		return;
	}
	if (value instanceof Date) {
		form.append(key, value.toISOString());
		return;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			form.append(`${key}[]`, "");
			return;
		}
		value.forEach((item, i) => append(form, `${key}[${i}]`, item));
		return;
	}
	if (typeof value === "object") {
		objectToFormData(value, form, key);
		return;
	}
	form.append(key, String(value));
}
//#endregion
//#region ../packages/core/dist/router/url.js
function currentOrigin() {
	return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}
function toUrl(href) {
	return href instanceof URL ? href : new URL(href, typeof window === "undefined" ? "http://localhost" : window.location.href);
}
function isSameOrigin(href) {
	try {
		return toUrl(href).origin === currentOrigin();
	} catch {
		return false;
	}
}
/** Path + query + hash, as the server reports it in `url` and as history stores it. */
function relativeUrl(href) {
	const url = toUrl(href);
	return url.pathname + url.search + url.hash;
}
/** Appends data as query parameters (Laravel bracket notation for nested values). */
function mergeQuery(href, data) {
	const url = toUrl(href);
	const add = (key, value) => {
		if (value === void 0 || value === null) return;
		if (Array.isArray(value)) {
			value.forEach((v, i) => add(`${key}[${i}]`, v));
			return;
		}
		if (typeof value === "object" && !(value instanceof Date)) {
			for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
			return;
		}
		url.searchParams.set(key, value instanceof Date ? value.toISOString() : String(value));
	};
	for (const [key, value] of Object.entries(data)) add(key, value);
	return url;
}
//#endregion
//#region ../packages/core/dist/http/RequestManager.js
/**
* Builds and sends Bridge page requests. Uses fetch, or XHR when a multipart
* body needs upload progress.
*/
var RequestManager = class {
	fetchImpl;
	credentials;
	xsrfCookie;
	constructor(options = {}) {
		this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
		this.credentials = options.credentials ?? "same-origin";
		this.xsrfCookie = options.xsrfCookie ?? (() => readXsrfToken());
	}
	prepare(request) {
		const headers = {
			Accept: PAGE_ACCEPT,
			"X-Requested-With": "XMLHttpRequest",
			...request.headers ?? {}
		};
		if (request.build) headers[HEADERS.build] = request.build;
		if (request.only && request.only.length > 0) headers[HEADERS.only] = request.only.join(",");
		if (request.except && request.except.length > 0) headers[HEADERS.except] = request.except.join(",");
		if ((request.only?.length || request.except?.length) && request.component) headers[HEADERS.component] = request.component;
		if (request.prefetch) headers["Purpose"] = "prefetch";
		let url = request.url instanceof URL ? new URL(request.url.href) : new URL(request.url, currentHref());
		let method = request.method.toUpperCase();
		let body = null;
		let multipart = false;
		if (method === "GET") {
			if (request.data && !(request.data instanceof FormData) && Object.keys(request.data).length > 0) url = mergeQuery(url, request.data);
		} else {
			const token = this.xsrfCookie();
			if (token) headers["X-XSRF-TOKEN"] = token;
			const data = request.data ?? {};
			multipart = request.forceFormData === true || data instanceof FormData || hasFiles(data);
			if (multipart) {
				const form = data instanceof FormData ? data : objectToFormData(data);
				if (method !== "POST") {
					form.append("_method", method);
					method = "POST";
				}
				body = form;
			} else {
				headers["Content-Type"] = "application/json";
				body = JSON.stringify(data);
			}
		}
		return {
			method,
			url,
			headers,
			body,
			multipart
		};
	}
	async send(request) {
		const prepared = this.prepare(request);
		if (prepared.multipart && request.onProgress && typeof XMLHttpRequest !== "undefined") return this.sendXhr(prepared, request);
		const response = await this.fetchImpl(prepared.url.href, {
			method: prepared.method,
			headers: prepared.headers,
			body: prepared.body,
			credentials: this.credentials,
			signal: request.signal ?? null,
			redirect: "follow"
		});
		return {
			status: response.status,
			headers: response.headers,
			url: response.url || prepared.url.href,
			text: () => response.text()
		};
	}
	sendXhr(prepared, request) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open(prepared.method, prepared.url.href, true);
			xhr.withCredentials = this.credentials !== "omit";
			for (const [name, value] of Object.entries(prepared.headers)) xhr.setRequestHeader(name, value);
			xhr.upload.addEventListener("progress", (event) => {
				if (!event.lengthComputable) return;
				request.onProgress?.({
					loaded: event.loaded,
					total: event.total,
					percentage: Math.round(event.loaded / event.total * 100)
				});
			});
			const abort = () => {
				xhr.abort();
				reject(new DOMException("The request was aborted.", "AbortError"));
			};
			request.signal?.addEventListener("abort", abort, { once: true });
			xhr.addEventListener("load", () => {
				request.signal?.removeEventListener("abort", abort);
				resolve({
					status: xhr.status,
					headers: parseHeaders(xhr.getAllResponseHeaders()),
					url: xhr.responseURL || prepared.url.href,
					text: () => Promise.resolve(xhr.responseText)
				});
			});
			xhr.addEventListener("error", () => reject(/* @__PURE__ */ new TypeError("Network request failed")));
			xhr.send(prepared.body);
		});
	}
};
function parseHeaders(raw) {
	const headers = new Headers();
	for (const line of raw.trim().split(/[\r\n]+/)) {
		const index = line.indexOf(":");
		if (index > 0) headers.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
	}
	return headers;
}
function currentHref() {
	return typeof window === "undefined" ? "http://localhost/" : window.location.href;
}
//#endregion
//#region ../packages/core/dist/pages/merge.js
/** Applies a stream/partial prop update using the protocol's merge modes. */
function mergeValue(current, incoming, mode = "replace") {
	switch (mode) {
		case "merge":
			if (isPlainObject(current) && isPlainObject(incoming)) return {
				...current,
				...incoming
			};
			return incoming;
		case "append":
			if (Array.isArray(current)) return [...current, ...Array.isArray(incoming) ? incoming : [incoming]];
			return incoming;
		case "prepend":
			if (Array.isArray(current)) return [...Array.isArray(incoming) ? incoming : [incoming], ...current];
			return incoming;
		default: return incoming;
	}
}
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Sets a (possibly dotted) key on a props object, returning a new object. */
function setDeep(props, key, value) {
	const segments = key.split(".");
	const result = { ...props };
	let cursor = result;
	for (let i = 0; i < segments.length - 1; i++) {
		const segment = segments[i];
		const next = cursor[segment];
		cursor[segment] = isPlainObject(next) ? { ...next } : {};
		cursor = cursor[segment];
	}
	cursor[segments[segments.length - 1]] = value;
	return result;
}
function getDeep(props, key) {
	let cursor = props;
	for (const segment of key.split(".")) {
		if (!isPlainObject(cursor)) return void 0;
		cursor = cursor[segment];
	}
	return cursor;
}
function hasDeep(props, key) {
	let cursor = props;
	for (const segment of key.split(".")) {
		if (!isPlainObject(cursor) || !(segment in cursor)) return false;
		cursor = cursor[segment];
	}
	return true;
}
//#endregion
//#region ../packages/core/dist/pages/PageStore.js
/** Keys the server marked with Bridge::merge() (spec/page.md §3, `meta.merge`). */
function readMergeKeys(page) {
	const meta = page.meta;
	return Array.isArray(meta?.merge) ? meta.merge.filter((k) => typeof k === "string") : [];
}
/**
* Appends incoming data to the current value: arrays concatenate; paginator-like
* objects concatenate `data` and take the rest (links, meta) from the incoming page.
*/
function appendProp(current, incoming) {
	if (Array.isArray(current) && Array.isArray(incoming)) return [...current, ...incoming];
	if (isPlainObject(current) && isPlainObject(incoming)) {
		const out = {
			...current,
			...incoming
		};
		for (const key of Object.keys(incoming)) if (Array.isArray(current[key]) && Array.isArray(incoming[key])) out[key] = [...current[key], ...incoming[key]];
		return out;
	}
	return incoming;
}
/**
* Holds the current page and notifies subscribers. Framework adapters wrap
* this in their reactivity system.
*/
var PageStore = class {
	state = {
		page: null,
		key: 0,
		loading: /* @__PURE__ */ new Set(),
		error: null
	};
	listeners = /* @__PURE__ */ new Set();
	constructor(initial = null) {
		if (initial) this.state.page = initial;
	}
	get page() {
		return this.state.page;
	}
	get current() {
		return this.state;
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	setPage(page, options = {}) {
		const previous = this.state.page;
		if (options.partial && previous && previous.component === page.component) {
			const mergeKeys = new Set(options.merge ? readMergeKeys(page) : []);
			const props = { ...previous.props };
			for (const [key, value] of Object.entries(page.props)) props[key] = mergeKeys.has(key) ? appendProp(previous.props[key], value) : value;
			this.state = {
				...this.state,
				page: {
					...previous,
					url: page.url,
					build: page.build,
					props,
					...page.meta ? { meta: page.meta } : {}
				},
				error: null
			};
			this.notify();
			return;
		}
		const sameComponent = previous?.component === page.component;
		const preserve = options.preserveState === true && sameComponent;
		this.state = {
			...this.state,
			page,
			key: preserve ? this.state.key : this.state.key + 1,
			loading: /* @__PURE__ */ new Set(),
			error: null
		};
		this.notify();
	}
	/** Replace props wholesale (used by history restore). */
	replaceProps(props) {
		if (!this.state.page) return;
		this.state = {
			...this.state,
			page: {
				...this.state.page,
				props
			}
		};
		this.notify();
	}
	setProp(key, value, mode = "replace") {
		if (!this.state.page) return;
		const current = getDeep(this.state.page.props, key);
		const props = setDeep(this.state.page.props, key, mergeValue(current, value, mode));
		this.state = {
			...this.state,
			page: {
				...this.state.page,
				props
			}
		};
		this.notify();
	}
	hasProp(key) {
		return this.state.page ? hasDeep(this.state.page.props, key) : false;
	}
	setLoading(keys, loading) {
		const next = new Set(this.state.loading);
		for (const key of keys) if (loading) next.add(key);
		else next.delete(key);
		this.state = {
			...this.state,
			loading: next
		};
		this.notify();
	}
	setError(error) {
		this.state = {
			...this.state,
			error
		};
		this.notify();
	}
	/**
	* Applies a `prop` control event. `invalidate` and `navigate` need the
	* router and are handled there (Phase 3 wires the stream client).
	*/
	applyControl(event) {
		if (event.type === "prop") {
			if (!this.hasProp(event.key)) return false;
			this.setProp(event.key, event.value, event.mode ?? "replace");
			return true;
		}
		return false;
	}
	notify() {
		for (const listener of Array.from(this.listeners)) listener(this.state);
	}
};
//#endregion
//#region ../packages/core/dist/router/History.js
/**
* Wraps the History API: each page swap stores the page object, scroll
* positions and remembered component state so back/forward restore without a request.
*/
var History = class {
	win;
	popListener = null;
	onPop = (event) => {
		const state = isHistoryState(event.state) ? event.state : null;
		this.popListener?.(state, event);
	};
	constructor(options = {}) {
		this.win = options.window ?? (typeof window === "undefined" ? null : window);
	}
	listen(listener) {
		this.popListener = listener;
		this.win?.addEventListener("popstate", this.onPop);
		return () => {
			this.popListener = null;
			this.win?.removeEventListener("popstate", this.onPop);
		};
	}
	current() {
		const state = this.win?.history.state;
		return isHistoryState(state) ? state : null;
	}
	push(page, key, replace = false) {
		if (!this.win) return;
		const state = {
			bridge: true,
			page,
			key,
			scroll: {
				window: [0, 0],
				regions: []
			},
			remember: replace ? this.current()?.remember ?? {} : {}
		};
		const url = page.url;
		if (replace) this.win.history.replaceState(state, "", url);
		else this.win.history.pushState(state, "", url);
	}
	/** Updates the stored page (e.g. after a partial reload) without a new entry. */
	updatePage(page) {
		const state = this.current();
		if (!state || !this.win) return;
		this.win.history.replaceState({
			...state,
			page
		}, "", page.url);
	}
	saveScroll(scroll) {
		const state = this.current();
		if (!state || !this.win) return;
		this.win.history.replaceState({
			...state,
			scroll
		}, "", this.win.location.href);
	}
	remember(key, value) {
		const state = this.current();
		if (!state || !this.win) return;
		this.win.history.replaceState({
			...state,
			remember: {
				...state.remember,
				[key]: value
			}
		}, "", this.win.location.href);
	}
	restore(key) {
		return this.current()?.remember[key];
	}
	back() {
		this.win?.history.back();
	}
};
function isHistoryState(value) {
	return typeof value === "object" && value !== null && value.bridge === true && "page" in value;
}
//#endregion
//#region ../packages/core/dist/http/responseParser.js
async function parseResponse(response) {
	const contentType = response.headers.get("content-type");
	if (response.status === 409 && response.headers.get(HEADERS.location)) return {
		kind: "conflict",
		location: response.headers.get(HEADERS.location)
	};
	if (response.status === 406) return {
		kind: "unsupported",
		status: 406
	};
	if (response.status === 204 || response.status === 304) return {
		kind: "empty",
		status: response.status,
		url: response.url
	};
	const version = parseBridgeContentType(contentType);
	const body = await response.text();
	if (version === null) return {
		kind: "invalid",
		status: response.status,
		contentType,
		body,
		url: response.url
	};
	let json;
	try {
		json = JSON.parse(body);
	} catch {
		return {
			kind: "invalid",
			status: response.status,
			contentType,
			body,
			url: response.url
		};
	}
	if (isPage(json)) return {
		kind: "page",
		page: json,
		url: response.url,
		status: response.status
	};
	if (isError(json)) return {
		kind: "error",
		error: json.error,
		status: response.status,
		url: response.url
	};
	return {
		kind: "invalid",
		status: response.status,
		contentType,
		body,
		url: response.url
	};
}
//#endregion
//#region ../packages/core/dist/router/Scroll.js
var SCROLL_REGION_ATTRIBUTE = "bridge-scroll-region";
function captureScroll(doc = document) {
	const win = doc.defaultView;
	const regions = Array.from(doc.querySelectorAll(`[${SCROLL_REGION_ATTRIBUTE}]`)).map((el) => [el.scrollLeft, el.scrollTop]);
	return {
		window: [win?.scrollX ?? 0, win?.scrollY ?? 0],
		regions
	};
}
function restoreScroll(positions, doc = document) {
	doc.defaultView?.scrollTo(positions.window[0], positions.window[1]);
	const regions = doc.querySelectorAll(`[${SCROLL_REGION_ATTRIBUTE}]`);
	positions.regions.forEach(([left, top], i) => {
		const el = regions[i];
		if (el) {
			el.scrollLeft = left;
			el.scrollTop = top;
		}
	});
}
function resetScroll(doc = document, hash = "") {
	if (hash) {
		const target = doc.getElementById(hash.replace(/^#/, ""));
		if (target) {
			target.scrollIntoView();
			return;
		}
	}
	doc.defaultView?.scrollTo(0, 0);
	doc.querySelectorAll(`[${SCROLL_REGION_ATTRIBUTE}]`).forEach((el) => {
		el.scrollLeft = 0;
		el.scrollTop = 0;
	});
}
//#endregion
//#region ../packages/core/dist/router/Router.js
/**
* Navigation engine: visits, partial reloads, deferred props, prefetch,
* history and scroll (PLAN §11).
*/
var Router = class {
	activeVisit = null;
	deferredControllers = /* @__PURE__ */ new Set();
	visitId = 0;
	pendingReload = null;
	reloadTimer = null;
	unlistenHistory = null;
	d;
	constructor(deps) {
		this.d = deps;
	}
	/** Registers history listeners and records the initial entry. Call once after the page is available. */
	init() {
		const page = this.d.store.page;
		if (page && this.d.window) {
			if (!this.d.history.current()) this.d.history.push(page, this.d.store.current.key, true);
		}
		this.unlistenHistory = this.d.history.listen((state) => this.onPopState(state));
		if (page) this.loadDeferred(page);
	}
	destroy() {
		this.unlistenHistory?.();
		this.cancelActive();
		this.cancelDeferred();
	}
	get page() {
		return this.d.store.page;
	}
	visit(url, options = {}) {
		return this.performVisit(url, options, false);
	}
	get(url, data, options = {}) {
		return this.visit(url, {
			...options,
			method: "get",
			data
		});
	}
	post(url, data, options = {}) {
		return this.visit(url, {
			...options,
			method: "post",
			data
		});
	}
	put(url, data, options = {}) {
		return this.visit(url, {
			...options,
			method: "put",
			data
		});
	}
	patch(url, data, options = {}) {
		return this.visit(url, {
			...options,
			method: "patch",
			data
		});
	}
	delete(url, options = {}) {
		return this.visit(url, {
			...options,
			method: "delete"
		});
	}
	/**
	* Partial reload of the current page. Calls within the debounce window are
	* coalesced into one request (needed for stream invalidations).
	*/
	reload(options = {}) {
		return new Promise((resolve) => {
			const pending = this.pendingReload ??= {
				only: /* @__PURE__ */ new Set(),
				except: /* @__PURE__ */ new Set(),
				headers: {},
				preserveScroll: true,
				resolvers: [],
				callbacks: []
			};
			if (!options.only || options.only.length === 0) pending.only = null;
			else if (pending.only) options.only.forEach((k) => pending.only.add(k));
			options.except?.forEach((k) => pending.except.add(k));
			Object.assign(pending.headers, options.headers ?? {});
			if (options.preserveScroll === false) pending.preserveScroll = false;
			pending.resolvers.push(resolve);
			pending.callbacks.push(options);
			if (this.reloadTimer) clearTimeout(this.reloadTimer);
			this.reloadTimer = setTimeout(() => void this.flushReload(), this.d.reloadDebounce);
		});
	}
	/** Reload the given prop keys ("*" reloads everything present on the page). */
	invalidate(keys) {
		if (!this.d.store.page) return null;
		if (keys === "*") return this.reload();
		const present = keys.filter((key) => this.d.store.hasProp(key.split(".")[0]));
		if (present.length === 0) return null;
		return this.reload({ only: present });
	}
	/** Server-initiated navigation (stream `navigate` control event). */
	navigate(url, replace = false) {
		if (!isSameOrigin(url) && !this.d.allowExternalNavigate) return null;
		return this.visit(url, { replace });
	}
	async prefetch(url, options = {}) {
		const target = toUrl(url);
		if (!isSameOrigin(target)) return;
		const key = PageCache.key(relativeUrl(target), options.only, options.except);
		if (this.d.cache.get(key).state === "fresh") return;
		try {
			const parsed = await parseResponse(await this.d.http.send({
				method: "get",
				url: target,
				only: options.only,
				except: options.except,
				headers: options.headers,
				component: this.d.store.page?.component,
				build: this.d.build(),
				prefetch: true
			}));
			if (parsed.kind === "page") this.d.cache.set(key, parsed.page);
		} catch {}
	}
	back() {
		this.d.history.back();
	}
	remember(key, value) {
		this.d.history.remember(key, value);
	}
	restore(key) {
		return this.d.history.restore(key);
	}
	clearCache() {
		this.d.cache.clear();
	}
	cancel() {
		this.cancelActive();
	}
	async flushReload() {
		const pending = this.pendingReload;
		this.pendingReload = null;
		this.reloadTimer = null;
		if (!pending) return;
		const page = this.d.store.page;
		const url = page ? page.url : this.d.window?.location.href ?? "/";
		const outcome = await this.performVisit(url, {
			only: pending.only ? Array.from(pending.only) : void 0,
			except: pending.only ? void 0 : Array.from(pending.except),
			headers: pending.headers,
			preserveState: true,
			preserveScroll: pending.preserveScroll,
			replace: true,
			useCache: false,
			onSuccess: (p) => pending.callbacks.forEach((c) => c.onSuccess?.(p)),
			onFinish: () => pending.callbacks.forEach((c) => c.onFinish?.())
		}, true);
		pending.resolvers.forEach((resolve) => resolve(outcome));
	}
	buildVisit(url, options) {
		return {
			id: ++this.visitId,
			url: toUrl(url),
			method: options.method ?? "get",
			data: options.data ?? {},
			headers: options.headers ?? {},
			replace: options.replace ?? false,
			preserveState: options.preserveState ?? false,
			preserveScroll: options.preserveScroll ?? false,
			only: options.only ?? [],
			except: options.except ?? [],
			merge: options.merge ?? false,
			prefetch: false,
			completed: false,
			cancelled: false,
			controller: new AbortController()
		};
	}
	async performVisit(url, options, isReload) {
		const visit = this.buildVisit(url, options);
		if (!isSameOrigin(visit.url)) {
			this.hardNavigate(visit.url.href);
			return { status: "redirected" };
		}
		if (options.onBefore?.(visit) === false || !this.d.events.emit("before", visit)) return { status: "cancelled" };
		this.cancelActive();
		if (!isReload) this.cancelDeferred();
		this.activeVisit = visit;
		const cacheable = visit.method === "get" && options.useCache !== false && !(visit.data instanceof FormData) && Object.keys(visit.data).length === 0;
		const cacheKey = PageCache.key(relativeUrl(visit.url), visit.only, visit.except);
		if (cacheable) {
			const lookup = this.d.cache.get(cacheKey);
			if (lookup.state === "fresh") {
				await this.prepare(lookup.entry.page);
				this.applyPage(lookup.entry.page, visit);
				this.finish(visit, options);
				options.onSuccess?.(lookup.entry.page);
				return {
					status: "success",
					page: lookup.entry.page
				};
			}
			if (lookup.state === "stale") {
				await this.prepare(lookup.entry.page);
				this.applyPage(lookup.entry.page, visit);
				visit.preserveState = true;
				visit.preserveScroll = true;
				visit.replace = true;
			}
		}
		this.d.events.emit("start", visit);
		options.onStart?.(visit);
		let parsed;
		try {
			parsed = await parseResponse(await this.d.http.send({
				method: visit.method,
				url: visit.url,
				data: visit.data,
				headers: visit.headers,
				only: visit.only,
				except: visit.except,
				component: this.d.store.page?.component,
				build: this.d.build(),
				signal: visit.controller.signal,
				forceFormData: options.forceFormData,
				onProgress: (progress) => {
					this.d.events.emit("progress", {
						visit,
						progress
					});
					options.onProgress?.(progress);
				}
			}));
		} catch (error) {
			if (visit.cancelled || error instanceof DOMException && error.name === "AbortError") {
				options.onCancel?.();
				this.d.events.emit("cancel", visit);
				this.finish(visit, options);
				return { status: "cancelled" };
			}
			const exception = this.exception({
				kind: "network",
				visit,
				error
			});
			this.finish(visit, options);
			options.onException?.(exception);
			return {
				status: "exception",
				exception
			};
		}
		if (visit.cancelled) {
			this.finish(visit, options);
			return { status: "cancelled" };
		}
		const outcome = await this.handleParsed(parsed, visit, options, cacheable ? cacheKey : null);
		this.finish(visit, options);
		return outcome;
	}
	async handleParsed(parsed, visit, options, cacheKey) {
		switch (parsed.kind) {
			case "conflict":
				this.hardNavigate(parsed.location);
				return { status: "redirected" };
			case "unsupported":
				this.hardNavigate(visit.url.href);
				return { status: "redirected" };
			case "page":
				if (cacheKey && visit.method === "get") this.d.cache.set(cacheKey, parsed.page);
				if (visit.method !== "get") this.d.cache.clear();
				await this.prepare(parsed.page);
				if (visit.cancelled) return { status: "cancelled" };
				this.applyPage(parsed.page, visit);
				this.d.events.emit("success", {
					visit,
					page: parsed.page
				});
				options.onSuccess?.(parsed.page);
				return {
					status: "success",
					page: parsed.page
				};
			case "error": return this.handleError(parsed.error, visit, options);
			case "empty":
				options.onSuccess?.(this.d.store.page);
				return {
					status: "success",
					page: this.d.store.page
				};
			case "invalid": {
				const exception = this.exception({
					kind: "invalid-response",
					visit,
					status: parsed.status,
					contentType: parsed.contentType,
					body: parsed.body
				});
				options.onException?.(exception);
				return {
					status: "exception",
					exception
				};
			}
		}
	}
	handleError(error, visit, options) {
		if (error.kind === "validation" || error.status === 422) {
			const errors = {};
			for (const [field, messages] of Object.entries(error.errors ?? {})) if (messages) errors[field] = messages;
			this.d.events.emit("invalid", {
				visit,
				errors,
				error
			});
			options.onInvalid?.(errors, error);
			return {
				status: "invalid",
				errors,
				error
			};
		}
		if (error.status === 401 || error.status === 403 || error.status === 419) this.d.cache.clear();
		if (error.kind === "unauthenticated" && error.redirect) {
			this.d.events.emit("error", {
				visit,
				error
			});
			options.onError?.(error);
			this.visit(error.redirect, { replace: true });
			return {
				status: "error",
				error
			};
		}
		if (error.kind === "csrf") {
			this.d.events.emit("error", {
				visit,
				error
			});
			options.onError?.(error);
			this.hardNavigate(this.d.window?.location.href ?? visit.url.href);
			return {
				status: "error",
				error
			};
		}
		const handled = !this.d.events.emit("error", {
			visit,
			error
		});
		options.onError?.(error);
		if (!handled) {
			if (this.d.hardReloadOnError && visit.method === "get") this.hardNavigate(visit.url.href);
			else this.d.store.setError({
				status: error.status,
				kind: error.kind,
				message: error.message
			});
		}
		return {
			status: "error",
			error
		};
	}
	exception(partial) {
		let prevented = false;
		const exception = {
			...partial,
			preventDefault: () => prevented = true
		};
		this.d.events.emit("exception", exception);
		if (!prevented && partial.kind === "invalid-response") {
			if (partial.visit.method === "get") this.hardNavigate(partial.visit.url.href);
			else this.d.store.setError({
				status: partial.status ?? 0,
				kind: "invalid_response",
				message: "The server returned a non-Bridge response."
			});
		}
		return exception;
	}
	applyPage(page, visit) {
		const current = this.d.store.page;
		if ((visit.only.length > 0 || visit.except.length > 0) && current !== null && current.component === page.component) {
			this.d.store.setPage(page, {
				partial: true,
				merge: visit.merge
			});
			this.d.history.updatePage(this.d.store.page);
			this.d.events.emit("navigate", {
				page: this.d.store.page,
				visit
			});
			return;
		}
		if (current && this.d.window) this.d.history.saveScroll(captureScroll(this.d.window.document));
		this.d.store.setPage(page, { preserveState: visit.preserveState });
		const replace = visit.replace || this.d.window !== null && relativeUrl(page.url) === relativeUrl(this.d.window.location.href);
		this.d.history.push(page, this.d.store.current.key, replace);
		if (!visit.preserveScroll && this.d.window) resetScroll(this.d.window.document, visit.url.hash);
		this.d.events.emit("navigate", {
			page,
			visit
		});
		this.loadDeferred(page);
	}
	async loadDeferred(page) {
		const groups = page.deferred ? Object.values(page.deferred).filter((g) => Array.isArray(g)) : [];
		if (groups.length === 0) return;
		await Promise.all(groups.map(async (group) => {
			const keys = Array.from(group);
			const controller = new AbortController();
			this.deferredControllers.add(controller);
			this.d.store.setLoading(keys, true);
			try {
				const parsed = await parseResponse(await this.d.http.send({
					method: "get",
					url: page.url,
					only: keys,
					component: page.component,
					build: this.d.build(),
					signal: controller.signal
				}));
				const current = this.d.store.page;
				if (parsed.kind === "page" && current && current.component === parsed.page.component) {
					this.d.store.setPage(parsed.page, { partial: true });
					this.d.history.updatePage(this.d.store.page);
				}
			} catch {} finally {
				this.deferredControllers.delete(controller);
				this.d.store.setLoading(keys, false);
			}
		}));
	}
	onPopState(state) {
		this.cancelActive();
		this.cancelDeferred();
		if (state?.page) {
			this.restoreFromHistory(state);
			return;
		}
		if (this.d.window) this.visit(this.d.window.location.href, {
			replace: true,
			useCache: false
		});
	}
	async restoreFromHistory(state) {
		await this.prepare(state.page);
		this.d.store.setPage(state.page, { preserveState: false });
		if (this.d.window) restoreScroll(state.scroll, this.d.window.document);
		this.d.events.emit("navigate", {
			page: state.page,
			visit: null
		});
	}
	async prepare(page) {
		if (!this.d.prepare) return;
		try {
			await this.d.prepare(page);
		} catch (error) {
			console.error("[bridge] failed to prepare page", page.component, error);
		}
	}
	cancelActive() {
		if (this.activeVisit && !this.activeVisit.completed) {
			this.activeVisit.cancelled = true;
			this.activeVisit.controller.abort();
		}
		this.activeVisit = null;
	}
	cancelDeferred() {
		for (const controller of this.deferredControllers) controller.abort();
		this.deferredControllers.clear();
	}
	finish(visit, options) {
		if (visit.completed) return;
		visit.completed = true;
		if (this.activeVisit === visit) this.activeVisit = null;
		this.d.events.emit("finish", visit);
		options.onFinish?.(visit);
	}
	hardNavigate(url) {
		if (this.d.window) this.d.window.location.href = url;
	}
};
//#endregion
//#region ../packages/core/dist/stream/backoff.js
var Backoff = class {
	attempt = 0;
	initial;
	max;
	factor;
	jitter;
	random;
	constructor(options = {}) {
		this.initial = options.initial ?? 1e3;
		this.max = options.max ?? 3e4;
		this.factor = options.factor ?? 2;
		this.jitter = options.jitter ?? .3;
		this.random = options.random ?? Math.random;
	}
	get attempts() {
		return this.attempt;
	}
	/** Next delay in ms; `base` overrides the initial delay (server `retry:`). */
	next(base) {
		const start = base ?? this.initial;
		const raw = Math.min(this.max, start * Math.pow(this.factor, this.attempt));
		this.attempt++;
		const spread = raw * this.jitter;
		return Math.max(0, Math.round(raw - spread + this.random() * spread * 2));
	}
	reset() {
		this.attempt = 0;
	}
};
//#endregion
//#region ../packages/core/dist/stream/sseParser.js
var SseParser = class {
	handlers;
	buffer = "";
	eventName = "";
	dataLines = [];
	id = null;
	lastId = null;
	retry = null;
	constructor(handlers) {
		this.handlers = handlers;
	}
	get lastEventId() {
		return this.lastId;
	}
	feed(chunk) {
		this.buffer += chunk;
		let index;
		while ((index = this.findLineEnd()) !== -1) {
			const line = this.buffer.slice(0, index);
			const skip = this.buffer[index] === "\r" && this.buffer[index + 1] === "\n" ? 2 : 1;
			this.buffer = this.buffer.slice(index + skip);
			this.processLine(line);
		}
	}
	/** Flush a trailing event with no terminating blank line (stream closed). */
	end() {
		if (this.buffer !== "") {
			const line = this.buffer;
			this.buffer = "";
			this.processLine(line);
		}
		this.dispatch();
	}
	findLineEnd() {
		for (let i = 0; i < this.buffer.length; i++) {
			const c = this.buffer[i];
			if (c === "\n") return i;
			if (c === "\r") {
				if (i === this.buffer.length - 1) return -1;
				return i;
			}
		}
		return -1;
	}
	processLine(line) {
		if (line === "") {
			this.dispatch();
			return;
		}
		if (line.startsWith(":")) {
			this.handlers.onComment?.(line.slice(1).replace(/^ /, ""));
			return;
		}
		const colon = line.indexOf(":");
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? "" : line.slice(colon + 1);
		if (value.startsWith(" ")) value = value.slice(1);
		switch (field) {
			case "event":
				this.eventName = value;
				break;
			case "data":
				this.dataLines.push(value);
				break;
			case "id":
				if (!value.includes("\0")) this.id = value;
				break;
			case "retry": if (/^\d+$/.test(value)) {
				this.retry = Number(value);
				this.handlers.onRetry?.(this.retry);
			}
		}
	}
	dispatch() {
		if (this.id !== null) this.lastId = this.id;
		if (this.dataLines.length === 0) {
			this.eventName = "";
			this.id = null;
			return;
		}
		const event = {
			event: this.eventName || "message",
			data: this.dataLines.join("\n"),
			id: this.lastId,
			retry: this.retry
		};
		this.eventName = "";
		this.dataLines = [];
		this.id = null;
		this.handlers.onEvent(event);
	}
};
//#endregion
//#region ../packages/core/dist/stream/StreamClient.js
/**
* SSE client with fetch (default; can send headers) and native EventSource
* transports, reconnection with backoff and Last-Event-ID, a heartbeat
* watchdog, and control-event dispatch to the page store/router (PLAN §20.5).
*/
var StreamClient = class {
	url;
	options;
	deps;
	events = new Emitter();
	_state = "idle";
	controller = null;
	source = null;
	backoff;
	retryMs = null;
	lastEventId = null;
	heartbeatMs = 15e3;
	watchdog = null;
	reconnectTimer = null;
	everConnected = false;
	closed = false;
	_lastEventAt = null;
	_reconnects = 0;
	fetchImpl;
	onWake = () => {
		if (this.closed) return;
		if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
		if (this._state === "reconnecting") {
			this.clearReconnect();
			this.connect();
		}
	};
	constructor(url, options, deps) {
		this.url = url;
		this.options = options;
		this.deps = deps;
		this.backoff = new Backoff(options.backoff);
		this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
		if (options.reconnectOnWake !== false && deps.window) {
			deps.window.addEventListener("online", this.onWake);
			deps.window.document.addEventListener("visibilitychange", this.onWake);
		}
		if (options.autoConnect !== false) this.connect();
	}
	get state() {
		return this._state;
	}
	get lastEventAt() {
		return this._lastEventAt;
	}
	get reconnectAttempts() {
		return this._reconnects;
	}
	on(event, listener) {
		return this.events.on(event, listener);
	}
	off(event, listener) {
		this.events.off(event, listener);
	}
	async connect() {
		if (this._state === "connecting" || this._state === "open") return;
		this.closed = false;
		this.setState(this.everConnected ? "reconnecting" : "connecting");
		if (this.everConnected) this._reconnects++;
		const target = await this.resolveTarget();
		if (this.options.transport === "eventsource" && typeof EventSource !== "undefined") {
			this.connectEventSource(target);
			return;
		}
		await this.connectFetch(target);
	}
	close() {
		this.closed = true;
		this.clearReconnect();
		this.stopWatchdog();
		this.controller?.abort();
		this.controller = null;
		this.source?.close();
		this.source = null;
		if (this.deps.window) {
			this.deps.window.removeEventListener("online", this.onWake);
			this.deps.window.document.removeEventListener("visibilitychange", this.onWake);
		}
		this.setState("closed");
	}
	async resolveTarget() {
		const url = toUrl(this.options.resolveUrl ? await this.options.resolveUrl() : this.url);
		if (this.options.channels && this.options.channels.length > 0) url.searchParams.set("channels", this.options.channels.join(","));
		return url.href;
	}
	headers() {
		const headers = {
			Accept: "text/event-stream",
			...typeof this.options.headers === "function" ? this.options.headers() : this.options.headers ?? {}
		};
		if (this.lastEventId) headers["Last-Event-ID"] = this.lastEventId;
		return headers;
	}
	async connectFetch(target) {
		const controller = new AbortController();
		this.controller = controller;
		const parser = new SseParser({
			onEvent: (event) => this.handleEvent(event),
			onComment: () => this.heartbeat(),
			onRetry: (ms) => this.retryMs = ms
		});
		let response;
		try {
			response = await this.fetchImpl(target, {
				method: "GET",
				headers: this.headers(),
				credentials: this.options.withCredentials === false ? "omit" : "same-origin",
				signal: controller.signal,
				cache: "no-store"
			});
		} catch (error) {
			if (controller.signal.aborted) return;
			this.emitTransportError(String(error?.message ?? error));
			this.scheduleReconnect();
			return;
		}
		if (controller.signal.aborted) return;
		if (response.status === 401 || response.status === 403) {
			this.emitTransportError(`Stream refused with status ${response.status}`, response.status);
			this.close();
			return;
		}
		if (!response.ok || !response.body) {
			this.emitTransportError(`Stream failed with status ${response.status}`, response.status);
			this.scheduleReconnect();
			return;
		}
		this.everConnected;
		this.everConnected = true;
		this.setState("open");
		this.startWatchdog();
		const connectedAt = Date.now();
		this.sawError = false;
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				this.touch();
				parser.feed(decoder.decode(value, { stream: true }));
			}
			parser.end();
		} catch (error) {
			if (controller.signal.aborted) return;
			this.emitTransportError(String(error?.message ?? error));
		}
		if (controller.signal.aborted || this.closed) return;
		this.stopWatchdog();
		if (this.pendingEnd) {
			const end = this.pendingEnd;
			this.pendingEnd = null;
			this.lastCloseOrderly = true;
			if (!end.reconnect) {
				this.close();
				return;
			}
			if (!this.sawError && Date.now() - connectedAt >= 1e3) {
				this.backoff.reset();
				this.setState("reconnecting");
				this._reconnects++;
				this.reconnectNow();
			} else this.scheduleReconnect();
			return;
		}
		if (this.finalError) {
			this.close();
			return;
		}
		this.scheduleReconnect();
	}
	connectEventSource(target) {
		const source = new EventSource(target, { withCredentials: this.options.withCredentials !== false });
		this.source = source;
		source.onopen = () => {
			this.everConnected = true;
			this.setState("open");
			this.backoff.reset();
		};
		source.onerror = () => {
			if (source.readyState === EventSource.CLOSED) {
				this.source = null;
				if (!this.closed) this.scheduleReconnect();
			} else this.setState("reconnecting");
		};
		source.addEventListener(CONTROL_EVENT, (e) => this.handleEvent({
			event: CONTROL_EVENT,
			data: e.data,
			id: e.lastEventId || null,
			retry: null
		}));
		for (const name of this.appEventNames) source.addEventListener(name, (e) => this.handleEvent({
			event: name,
			data: e.data,
			id: e.lastEventId || null,
			retry: null
		}));
	}
	/** Names of application events to listen for with the EventSource transport (fetch needs none). */
	appEventNames = /* @__PURE__ */ new Set();
	pendingEnd = null;
	finalError = false;
	sawError = false;
	/** True when the last connection ended with an `end` control event (nothing was missed). */
	lastCloseOrderly = false;
	handleEvent(event) {
		this.touch();
		if (event.id) this.lastEventId = event.id;
		let data = event.data;
		try {
			data = JSON.parse(event.data);
		} catch {}
		if (event.event === "bridge") {
			if (!isControlEvent(data)) return;
			this.handleControl(data);
			this.events.emit("*", {
				name: CONTROL_EVENT,
				data,
				id: event.id,
				control: true
			});
			return;
		}
		this.events.emit("event", {
			name: event.event,
			data,
			id: event.id
		});
		this.events.emit(event.event, data);
		this.events.emit("*", {
			name: event.event,
			data,
			id: event.id,
			control: false
		});
	}
	handleControl(control) {
		const apply = this.options.handleControl !== false;
		switch (control.type) {
			case "ready": {
				this.heartbeatMs = control.heartbeat;
				this.backoff.reset();
				const reconnect = this._reconnects > 0;
				this.events.emit("ready", control);
				this.events.emit("open", {
					replayed: control.replayed,
					reconnect
				});
				if (apply && reconnect && !control.replayed && !this.lastCloseOrderly) this.deps.router.invalidate("*");
				this.lastCloseOrderly = false;
				break;
			}
			case "invalidate":
				this.events.emit("invalidate", control);
				if (apply) this.deps.router.invalidate(control.keys === "*" ? "*" : Array.from(control.keys));
				break;
			case "prop":
				this.events.emit("prop", control);
				if (apply) this.deps.store.applyControl(control);
				break;
			case "navigate":
				this.events.emit("navigate", control);
				if (apply && isSameOrigin(control.url)) this.deps.router.navigate(control.url, control.replace ?? false);
				break;
			case "notification":
				this.events.emit("notification", control);
				break;
			case "progress":
				this.events.emit("progress", control);
				break;
			case "error":
				this.events.emit("error", control);
				this.sawError = true;
				if (control.final) this.finalError = true;
				break;
			case "end":
				this.events.emit("end", control);
				this.pendingEnd = control;
		}
	}
	heartbeat() {
		this.touch();
		this.events.emit("heartbeat", Date.now());
	}
	touch() {
		this._lastEventAt = Date.now();
		this.startWatchdog();
	}
	startWatchdog() {
		this.stopWatchdog();
		if (this.options.transport === "eventsource") return;
		const timeout = Math.max(1e3, this.heartbeatMs * (this.options.heartbeatTimeout ?? 2.5));
		this.watchdog = setTimeout(() => {
			if (this._state !== "open") return;
			this.emitTransportError("No data received within the heartbeat timeout");
			this.controller?.abort();
			this.controller = null;
			this.scheduleReconnect();
		}, timeout);
	}
	stopWatchdog() {
		if (this.watchdog) clearTimeout(this.watchdog);
		this.watchdog = null;
	}
	scheduleReconnect() {
		if (this.closed) return;
		this.stopWatchdog();
		this.setState("reconnecting");
		const delay = this.backoff.next(this.retryMs ?? void 0);
		this.clearReconnect();
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this._reconnects++;
			this.reconnectNow();
		}, delay);
	}
	async reconnectNow() {
		if (this.closed) return;
		this._state = "reconnecting";
		const target = await this.resolveTarget();
		if (this.options.transport === "eventsource" && typeof EventSource !== "undefined") {
			this.connectEventSource(target);
			return;
		}
		await this.connectFetch(target);
	}
	clearReconnect() {
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}
	emitTransportError(message, status) {
		this.events.emit("error", {
			type: "transport",
			message,
			status
		});
	}
	setState(state) {
		if (this._state === state) return;
		this._state = state;
		this.events.emit("state", state);
	}
};
//#endregion
//#region ../packages/core/dist/createBridge.js
var current = null;
function createBridge(config = {}) {
	const win = config.window ?? (typeof window === "undefined" ? null : window);
	const doc = win?.document;
	const initialPage = config.initialPage !== void 0 ? config.initialPage : doc ? readEmbeddedPage(doc) : null;
	let build = config.build !== void 0 ? config.build : (doc ? readBuild(doc) : null) ?? initialPage?.build ?? null;
	const events = new Emitter();
	const store = new PageStore(initialPage);
	const http = new RequestManager({
		fetch: config.fetch,
		credentials: config.credentials
	});
	const history = new History({ window: win ?? void 0 });
	const cache = new PageCache({
		ttl: config.cache?.ttl ?? DEFAULT_CONFIG.cache.ttl,
		staleWhileRevalidate: config.cache?.staleWhileRevalidate ?? DEFAULT_CONFIG.cache.staleWhileRevalidate
	});
	const router = new Router({
		store,
		http,
		history,
		cache,
		events,
		build: () => bridge.build,
		window: win,
		reloadDebounce: config.reloadDebounce ?? DEFAULT_CONFIG.reloadDebounce,
		hardReloadOnError: config.hardReloadOnError ?? DEFAULT_CONFIG.hardReloadOnError,
		allowExternalNavigate: config.allowExternalNavigate ?? DEFAULT_CONFIG.allowExternalNavigate,
		prepare: config.prepare
	});
	events.on("navigate", ({ page }) => {
		if (page.build) build = page.build;
		bridge.build = build;
	});
	const bridge = {
		store,
		router,
		http,
		history,
		cache,
		events,
		config,
		build,
		on: events.on.bind(events),
		form: (initial, options) => new Form(router, initial, options),
		stream: (url, options = {}) => new StreamClient(url, {
			fetch: config.fetch,
			...options
		}, {
			store,
			router,
			window: win
		}),
		bootstrap: async () => {
			if (store.page || !win) return store.page;
			const outcome = await router.visit(win.location.href, {
				replace: true,
				useCache: false
			});
			return outcome.status === "success" ? outcome.page : null;
		},
		init: () => router.init(),
		destroy: () => {
			router.destroy();
			if (current === bridge) current = null;
		}
	};
	current = bridge;
	return bridge;
}
/** The most recently created Bridge instance, for code outside component trees. */
function getBridge() {
	if (!current) throw new Error("Bridge has not been created. Call createBridge() or createBridgeApp() first.");
	return current;
}
/** Lazy proxy to the current instance's router: `router.visit('/customers')`. */
var router = new Proxy({}, { get(_, prop) {
	const value = getBridge().router[prop];
	return typeof value === "function" ? value.bind(getBridge().router) : value;
} });
//#endregion
//#region ../packages/vue/dist/state.js
/** One reactive mirror of the PageStore per Bridge instance. */
var mirrors = /* @__PURE__ */ new WeakMap();
function pageStateRef(bridge) {
	let ref = mirrors.get(bridge);
	if (!ref) {
		ref = shallowRef(bridge.store.current);
		const target = ref;
		bridge.store.subscribe((state) => {
			target.value = state;
		});
		mirrors.set(bridge, ref);
	}
	return ref;
}
//#endregion
//#region ../packages/vue/dist/app.js
/** Loads page components by name and caches them (shared by client and server). */
function createComponentLoader(resolve) {
	const cache = /* @__PURE__ */ new Map();
	return {
		cache,
		async load(name) {
			const cached = cache.get(name);
			if (cached) return cached;
			const resolved = await resolve(name);
			const component = resolved.default ?? resolved;
			cache.set(name, component);
			return component;
		}
	};
}
function withLayouts(component, node) {
	const layout = component.layout;
	if (!layout) return node;
	return (Array.isArray(layout) ? layout : [layout]).reduceRight((child, Layout) => h(Layout, null, () => child), node);
}
function renderPage(component, page, key) {
	return withLayouts(component, h(component, {
		...page.props,
		key: `${page.component}-${key}`
	}));
}
/** A component that renders one fixed page (used by the SSR renderer). */
function createStaticApp(bridge, component, page) {
	return defineComponent({
		name: "BridgeSsrApp",
		setup() {
			const state = pageStateRef(bridge);
			return () => renderPage(component, page, state.value.key);
		}
	});
}
//#endregion
//#region ../packages/vue/dist/head.js
var HeadKey = Symbol("bridge-head");
function useHeadContext() {
	return inject(HeadKey, null);
}
function createHeadContext() {
	return {
		title: null,
		meta: []
	};
}
function escapeAttribute(value) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Head fragments for the shell (spec: strings inserted verbatim after @bridgeHead). */
function renderHead(head) {
	const out = [];
	if (head.title !== null) out.push(`<title>${escapeAttribute(head.title)}</title>`);
	for (const meta of head.meta) {
		const attrs = Object.entries(meta).map(([k, v]) => `${k}="${escapeAttribute(v)}"`).join(" ");
		out.push(`<meta ${attrs}>`);
	}
	return out;
}
//#endregion
//#region ../packages/vue/dist/injection.js
var BridgeKey = Symbol("bridge");
function useBridge() {
	const bridge = inject(BridgeKey, null);
	if (!bridge) throw new Error("Bridge is not installed. Call createBridgeApp() or app.use(bridgePlugin).");
	return bridge;
}
//#endregion
//#region ../packages/vue/dist/plugin.js
function createBridgePlugin(bridge) {
	return { install(app) {
		app.provide(BridgeKey, bridge);
		app.config.globalProperties.$bridge = bridge;
		const state = pageStateRef(bridge);
		Object.defineProperty(app.config.globalProperties, "$page", {
			get: () => state.value.page,
			enumerable: true
		});
	} };
}
//#endregion
//#region ../packages/vue/dist/server/index.js
/**
* @swarakaka/bridge-vue/server — render page objects to HTML for the Laravel
* SSR gateway (PLAN §26). Build with `vite build --ssr resources/js/ssr.ts`.
*/
function createSsrRenderer(options) {
	const loader = createComponentLoader(options.resolve);
	return async function render(page) {
		const component = await loader.load(page.component);
		const bridge = createBridge({
			initialPage: page,
			window: void 0,
			build: page.build
		});
		const head = createHeadContext();
		const app = createSSRApp({ render: () => h(createStaticApp(bridge, component, page)) });
		const plugin = createBridgePlugin(bridge);
		app.use(plugin);
		app.provide(HeadKey, head);
		options.setup?.({
			app,
			plugin,
			page
		});
		const body = await renderToString(app);
		return {
			head: renderHead(head),
			body
		};
	};
}
/**
* A tiny HTTP server: POST /render with a page object → { head, body }.
* GET /health → 200. Uses only node:http so the SSR bundle has no extra deps.
*/
async function createSsrServer(options) {
	const { createServer } = await import("node:http");
	const maxBody = options.maxBody ?? 2097152;
	const port = options.port ?? Number(process.env.BRIDGE_SSR_PORT ?? new URL(process.env.BRIDGE_SSR_URL ?? "http://127.0.0.1:13714").port ?? 13714);
	const host = options.host ?? "127.0.0.1";
	const server = createServer((req, res) => {
		if (req.method === "GET" && req.url === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end("{\"ok\":true}");
			return;
		}
		if (req.method !== "POST" || req.url !== "/render") {
			res.writeHead(404);
			res.end();
			return;
		}
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > maxBody) {
				res.writeHead(413);
				res.end();
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			let page;
			try {
				page = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			} catch {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end("{\"message\":\"Invalid JSON\"}");
				return;
			}
			if (!isPage(page)) {
				res.writeHead(422, { "Content-Type": "application/json" });
				res.end("{\"message\":\"Not a Bridge page object\"}");
				return;
			}
			options.render(page).then((result) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(result));
			}).catch((error) => {
				console.error("[bridge-ssr] render failed", error);
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Render failed" }));
			});
		});
	});
	await new Promise((resolve) => server.listen(port, host, resolve));
	const address = server.address();
	const boundPort = typeof address === "object" && address ? address.port : port;
	console.log(`[bridge-ssr] listening on http://${host}:${boundPort}`);
	return {
		port: boundPort,
		close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
	};
}
//#endregion
//#region resources/js/ssr.ts
/**
* SSR entry: `vite build --ssr resources/js/ssr.ts --outDir bootstrap/ssr`,
* then `php artisan bridge:ssr` (or `node bootstrap/ssr/ssr.js`).
*/
var pages = /* #__PURE__ */ Object.assign({
	"./Pages/Auth/Login.vue": () => import("./assets/Login-CgEE8rPj.js"),
	"./Pages/Auth/Tokens.vue": () => import("./assets/Tokens-BW75RKTc.js"),
	"./Pages/Customers/Create.vue": () => import("./assets/Create-D72xv_3r.js"),
	"./Pages/Customers/Edit.vue": () => import("./assets/Edit-BdgKciEh.js"),
	"./Pages/Customers/Index.vue": () => import("./assets/Index-DRrkDuN6.js"),
	"./Pages/Customers/Show.vue": () => import("./assets/Show-DVN2ONuW.js"),
	"./Pages/Dashboard.vue": () => import("./assets/Dashboard-Nqm8cBAQ.js"),
	"./Pages/Errors/Error.vue": () => import("./assets/Error-wqzF9gUV.js"),
	"./Pages/Errors/Index.vue": () => import("./assets/Index-CB6oKKn0.js"),
	"./Pages/Json.vue": () => import("./assets/Json-DyN5rq7K.js"),
	"./Pages/Realtime.vue": () => import("./assets/Realtime-B6lQDvku.js")
});
createSsrServer({ render: createSsrRenderer({ resolve: (name) => {
	const loader = pages[`./Pages/${name}.vue`];
	if (!loader) throw new Error(`Page component [${name}] not found.`);
	return loader();
} }) });
//#endregion
export { router as i, useHeadContext as n, pageStateRef as r, useBridge as t };
