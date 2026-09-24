<script setup lang="ts">
import { BridgeHead, useJson, useJsonForm, type Method } from '@swarakaka/bridge-vue'
import { computed, onMounted, ref } from 'vue'
import AppLayout from '@/Layouts/AppLayout.vue'

defineOptions({ layout: AppLayout })
const props = defineProps<{
    endpoints: Array<{ method: string; path: string; label: string }>
    accepts: string[]
}>()

const selected = ref(0)
const accept = ref(props.accepts[0] ?? 'application/json')
const token = ref('')
const body = ref('{"name": "Initech", "email": "it@initech.test"}')
const result = ref<{ status: number; headers: Array<[string, string]>; body: string } | null>(null)
const running = ref(false)

const endpoint = computed(() => props.endpoints[selected.value]!)

// The same call through the client: no Accept juggling, no manual CSRF, errors mapped.
const json = useJson<Record<string, unknown>>()
const runJson = (): Promise<unknown> => {
    let data: Record<string, unknown> | undefined
    if (endpoint.value.method !== 'GET') {
        try {
            data = JSON.parse(body.value) as Record<string, unknown>
        } catch {
            data = {}
        }
    }
    return json.request(endpoint.value.method.toLowerCase() as Method, endpoint.value.path, {
        data,
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
    })
}
const jsonBody = computed(() => {
    if (json.hasErrors) return JSON.stringify(json.allErrors, null, 2)
    if (json.lastError) return JSON.stringify(json.lastError, null, 2)
    return json.data === null ? '' : JSON.stringify(json.data, null, 2)
})

// A form over JSON mode: field state, 422 errors and Precognition like useForm, but no navigation.
const customer = useJsonForm<
    { name: string; email: string },
    { customer: { id: number; name: string } }
>({ name: '', email: '' })
const createCustomer = (): void => {
    void customer.post('/customers', { resetOnSuccess: true })
}

// Filled after mount: the server has no window, and the first client render must match it.
const origin = ref('')
onMounted(() => (origin.value = window.location.origin))

const curl = computed(() => {
    const parts = ['curl -i', `-H 'Accept: ${accept.value}'`]
    if (token.value) parts.push(`-H 'Authorization: Bearer ${token.value}'`)
    if (endpoint.value.method !== 'GET')
        parts.push(
            `-X ${endpoint.value.method}`,
            `-H 'Content-Type: application/json'`,
            `-d '${body.value}'`,
        )
    parts.push(`${origin.value}${endpoint.value.path}`)
    return parts.join(' \\\n  ')
})

const run = async (): Promise<void> => {
    running.value = true
    result.value = null
    try {
        const headers: Record<string, string> = { Accept: accept.value }
        if (token.value) headers.Authorization = `Bearer ${token.value}`
        if (endpoint.value.method !== 'GET') headers['Content-Type'] = 'application/json'
        const response = await fetch(endpoint.value.path, {
            method: endpoint.value.method,
            headers,
            body: endpoint.value.method !== 'GET' ? body.value : null,
            credentials: token.value ? 'omit' : 'same-origin',
        })
        const text = await response.text()
        let pretty = text
        try {
            pretty = JSON.stringify(JSON.parse(text), null, 2)
        } catch {
            // not JSON (HTML shell, SSE)
        }
        result.value = {
            status: response.status,
            headers: Array.from(response.headers.entries()),
            body: pretty,
        }
    } finally {
        running.value = false
    }
}
</script>

<template>
    <BridgeHead title="JSON demo · Bridge" />
    <h1 class="text-2xl font-semibold">Same route, different <code>Accept</code></h1>
    <p class="mt-1 text-sm text-slate-500">
        Every request below hits the same Laravel controller that renders this SPA. Only the
        <code>Accept</code> header changes. Customers routes need a session (sign in) or a bearer
        token from the Tokens page.
    </p>

    <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div class="space-y-3 text-sm">
            <label class="block">
                <span class="font-medium">Endpoint</span>
                <select
                    v-model="selected"
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    data-testid="endpoint"
                >
                    <option
                        v-for="(item, i) in endpoints"
                        :key="item.path + item.method"
                        :value="i"
                    >
                        {{ item.method }} {{ item.path }} — {{ item.label }}
                    </option>
                </select>
            </label>
            <label class="block">
                <span class="font-medium">Accept</span>
                <select
                    v-model="accept"
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    data-testid="accept"
                >
                    <option v-for="type in accepts" :key="type" :value="type">{{ type }}</option>
                </select>
            </label>
            <label class="block">
                <span class="font-medium">Bearer token (optional)</span>
                <input
                    v-model="token"
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    placeholder="from /tokens"
                    data-testid="token"
                />
            </label>
            <label v-if="endpoint.method !== 'GET'" class="block">
                <span class="font-medium">JSON body</span>
                <textarea
                    v-model="body"
                    rows="3"
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                    data-testid="body"
                />
            </label>
            <button
                class="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
                :disabled="running"
                data-testid="run"
                @click="run"
            >
                Send
            </button>
            <pre
                class="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100"
                data-testid="curl"
                >{{ curl }}</pre>

            <div class="rounded border border-slate-200 p-3">
                <div class="font-medium">Through <code>useJson()</code></div>
                <p class="mt-1 text-xs text-slate-500">
                    The same endpoint and body sent by the Vue client in JSON mode: CSRF and
                    credentials handled, the envelope unwrapped, a 422 mapped to
                    <code>errors</code>.
                </p>
                <button
                    class="mt-2 rounded border border-indigo-600 px-4 py-2 text-indigo-700 disabled:opacity-50"
                    :disabled="json.processing"
                    data-testid="run-json"
                    @click="runJson"
                >
                    Send with useJson
                </button>
                <div v-if="json.httpStatus !== null" class="mt-2" data-testid="json-result">
                    <div>
                        HTTP <span data-testid="json-status">{{ json.httpStatus }}</span>
                        <span v-if="json.meta.location" class="text-xs text-slate-500">
                            · location
                            <span data-testid="json-location">{{ json.meta.location }}</span>
                        </span>
                    </div>
                    <p v-if="json.message" class="text-xs text-rose-700" data-testid="json-message">
                        {{ json.message }}
                    </p>
                    <pre
                        class="mt-2 max-h-60 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100"
                        data-testid="json-body"
                        >{{ jsonBody }}</pre>
                </div>
            </div>

            <form
                class="space-y-2 rounded border border-slate-200 p-3"
                data-testid="json-form"
                @submit.prevent="createCustomer"
            >
                <div class="font-medium">Through <code>useJsonForm()</code></div>
                <p class="text-xs text-slate-500">
                    A form in JSON mode: <code>POST /customers</code> with
                    <code>Accept: application/json</code>, errors per field, live validation on
                    blur, and the created customer in <code>form.result</code>. The page stays.
                </p>
                <div v-for="field in ['name', 'email'] as const" :key="field">
                    <label :for="`json-${field}`" class="block text-xs font-medium capitalize">{{
                        field
                    }}</label>
                    <input
                        :id="`json-${field}`"
                        v-model="customer[field]"
                        class="mt-1 w-full rounded border border-slate-300 px-3 py-1"
                        :data-testid="`json-form-${field}`"
                        :aria-invalid="Boolean(customer.errors[field])"
                        @blur="customer.validate('post', '/customers', field)"
                    />
                    <p
                        v-if="customer.errors[field]"
                        class="text-xs text-rose-600"
                        :data-testid="`json-form-error-${field}`"
                    >
                        {{ customer.errors[field] }}
                    </p>
                </div>
                <button
                    type="submit"
                    class="rounded border border-indigo-600 px-4 py-2 text-indigo-700 disabled:opacity-50"
                    :disabled="customer.processing"
                    data-testid="json-form-submit"
                >
                    Create with useJsonForm
                </button>
                <p
                    v-if="customer.result && customer.wasSuccessful"
                    class="text-xs text-emerald-700"
                    data-testid="json-form-created"
                >
                    HTTP {{ customer.httpStatus }}: created {{ customer.result.customer.name }} at
                    {{ customer.meta.location }}
                </p>
            </form>
        </div>

        <div v-if="result" class="text-sm" data-testid="result">
            <div class="font-medium">
                HTTP <span data-testid="result-status">{{ result.status }}</span>
            </div>
            <ul class="mt-1 text-xs text-slate-500" data-testid="result-headers">
                <li v-for="[name, value] in result.headers" :key="name">
                    <b>{{ name }}</b
                    >: {{ value }}
                </li>
            </ul>
            <pre
                class="mt-2 max-h-[28rem] overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100"
                data-testid="result-body"
                >{{ result.body }}</pre>
        </div>
    </div>
</template>
