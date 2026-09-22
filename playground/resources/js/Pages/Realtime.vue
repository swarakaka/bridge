<script setup lang="ts">
import { BridgeHead, router, useProp, useForm } from '@swarakaka/bridge-vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import AppLayout from '@/Layouts/AppLayout.vue'
import { useAppStream } from '@/composables/useAppStream'

defineOptions({ layout: AppLayout })

const props = defineProps<{
    customersCount: number
    unreadCount: number
    channels: string[]
    heartbeatMs: number
    maxDurationS: number
    driver: string
}>()

const stream = useAppStream()
const unread = useProp<number>('unreadCount', 0)
const count = useProp<number>('customersCount', 0)

interface LogEntry {
    at: string
    kind: 'control' | 'event' | 'local'
    name: string
    detail: string
}
const log = ref<LogEntry[]>([])
const push = (kind: LogEntry['kind'], name: string, detail: unknown): void => {
    log.value.unshift({
        at: new Date().toLocaleTimeString(),
        kind,
        name,
        detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
    })
    if (log.value.length > 50) log.value.pop()
}

const offs: Array<() => void> = []
if (stream) {
    offs.push(
        stream.on('*', (e) =>
            push(
                e.control ? 'control' : 'event',
                e.control ? `bridge:${(e.data as { type: string }).type}` : e.name,
                e.data,
            ),
        ),
    )
    offs.push(stream.on('state', (s) => push('local', 'state', s)))
    offs.push(stream.on('heartbeat', () => push('local', 'heartbeat', 'hb')))
}
onBeforeUnmount(() => offs.forEach((off) => off()))

const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 500)
onBeforeUnmount(() => clearInterval(tick))
const sinceLast = computed(() =>
    stream?.lastEventAt.value ? Math.round((now.value - stream.lastEventAt.value) / 1000) : null,
)

const notify = useForm({ message: 'Hello from the server', level: 'success' })
const broadcast = useForm({ message: 'Everyone sees this' })
const trigger = (url: string): void => {
    void router.post(url, {}, { preserveScroll: true, preserveState: true })
}

// One-off producer stream (progress of a fake export) on a separate connection.
const exportProgress = ref<{ value: number; label: string } | null>(null)
const exportRows = ref<number | null>(null)
const runExport = async (): Promise<void> => {
    exportProgress.value = { value: 0, label: 'Starting' }
    exportRows.value = null
    const bridge = (await import('@swarakaka/bridge-vue')).getBridge()
    const s = bridge.stream('/realtime/export', { handleControl: false })
    s.on('progress', (p) => (exportProgress.value = { value: p.value ?? 0, label: p.label ?? '' }))
    s.on('export.done', (d) => (exportRows.value = (d as { rows: number }).rows))
    s.on('end', () => s.close())
}

const stateColor: Record<string, string> = {
    open: 'bg-emerald-500',
    connecting: 'bg-amber-500',
    reconnecting: 'bg-amber-500',
    closed: 'bg-slate-400',
    idle: 'bg-slate-400',
}
</script>

<template>
    <BridgeHead title="Realtime · Bridge" />
    <h1 class="text-2xl font-semibold">Realtime</h1>
    <p class="mt-1 text-sm text-slate-500">
        One SSE stream per signed-in user (bus driver: <code>{{ driver }}</code
        >, heartbeat {{ heartbeatMs / 1000 }}s, max duration {{ maxDurationS }}s, then a transparent
        reconnect). Channels: <code v-for="c in channels" :key="c" class="mr-1">{{ c }}</code>
    </p>

    <section class="mt-6 grid gap-4 sm:grid-cols-4" data-testid="status">
        <div class="rounded border border-slate-200 bg-white p-3">
            <div class="text-xs uppercase text-slate-500">Connection</div>
            <div class="mt-1 flex items-center gap-2">
                <span
                    class="inline-block h-2.5 w-2.5 rounded-full"
                    :class="stateColor[stream?.state.value ?? 'idle']"
                />
                <span data-testid="stream-state">{{ stream?.state.value ?? 'no stream' }}</span>
            </div>
        </div>
        <div class="rounded border border-slate-200 bg-white p-3">
            <div class="text-xs uppercase text-slate-500">Last heartbeat/event</div>
            <div class="mt-1" data-testid="since-last">
                {{ sinceLast === null ? '—' : `${sinceLast}s ago` }}
            </div>
        </div>
        <div class="rounded border border-slate-200 bg-white p-3">
            <div class="text-xs uppercase text-slate-500">Reconnects</div>
            <div class="mt-1" data-testid="reconnects">
                {{ stream?.reconnectAttempts.value ?? 0 }}
            </div>
        </div>
        <div class="rounded border border-slate-200 bg-white p-3">
            <div class="text-xs uppercase text-slate-500">Customers (invalidated live)</div>
            <div class="mt-1 text-xl font-semibold" data-testid="customers-count">{{ count }}</div>
        </div>
    </section>

    <section class="mt-6 grid gap-6 md:grid-cols-2">
        <div class="space-y-4">
            <h2 class="font-medium">Triggers</h2>

            <form
                class="flex gap-2"
                data-testid="notify-form"
                @submit.prevent="
                    notify.post('/realtime/notify', { preserveScroll: true, preserveState: true })
                "
            >
                <input
                    v-model="notify.data.message"
                    class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <select
                    v-model="notify.data.level"
                    class="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                    <option
                        v-for="l in ['info', 'success', 'warning', 'error']"
                        :key="l"
                        :value="l"
                    >
                        {{ l }}
                    </option>
                </select>
                <button
                    class="rounded bg-indigo-600 px-3 py-1 text-sm text-white"
                    data-testid="send-notification"
                >
                    Notify me
                </button>
            </form>

            <form
                class="flex gap-2"
                data-testid="broadcast-form"
                @submit.prevent="
                    broadcast.post('/realtime/broadcast', {
                        preserveScroll: true,
                        preserveState: true,
                    })
                "
            >
                <input
                    v-model="broadcast.data.message"
                    class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                    class="rounded bg-indigo-600 px-3 py-1 text-sm text-white"
                    data-testid="send-broadcast"
                >
                    Notify everyone
                </button>
            </form>

            <div class="flex flex-wrap gap-2 text-sm">
                <button
                    class="rounded border border-slate-300 px-3 py-1"
                    data-testid="push-prop"
                    @click="trigger('/realtime/prop')"
                >
                    Push prop <code>unreadCount</code> (now {{ unread }})
                </button>
                <button
                    class="rounded border border-slate-300 px-3 py-1"
                    data-testid="invalidate"
                    @click="trigger('/realtime/invalidate')"
                >
                    Invalidate customers
                </button>
                <button
                    class="rounded border border-rose-300 px-3 py-1 text-rose-700"
                    data-testid="end-connection"
                    @click="trigger('/realtime/end')"
                >
                    End connection (server)
                </button>
                <button
                    class="rounded border border-slate-300 px-3 py-1"
                    data-testid="run-export"
                    @click="runExport"
                >
                    Run export (producer stream)
                </button>
            </div>

            <div v-if="exportProgress" class="text-sm" data-testid="export">
                <div class="h-2 w-full rounded bg-slate-200">
                    <div
                        class="h-2 rounded bg-indigo-500"
                        :style="{ width: `${exportProgress.value * 100}%` }"
                    />
                </div>
                <div class="mt-1 text-slate-500">
                    {{ exportProgress.label }}
                    <span v-if="exportRows !== null" data-testid="export-rows"
                        >— done, {{ exportRows }} rows</span
                    >
                </div>
            </div>

            <p class="text-xs text-slate-400">
                Open this page in a second browser, create a customer there, and watch the customers
                count and the event log here.
            </p>
        </div>

        <div>
            <h2 class="font-medium">Event log</h2>
            <ul
                class="mt-2 max-h-96 overflow-auto rounded border border-slate-200 bg-white text-xs"
                data-testid="event-log"
            >
                <li
                    v-for="(entry, i) in log"
                    :key="i"
                    class="flex gap-2 border-b border-slate-100 px-2 py-1"
                    :data-kind="entry.kind"
                    :data-name="entry.name"
                >
                    <span class="text-slate-400">{{ entry.at }}</span>
                    <span
                        class="w-36 shrink-0 font-medium"
                        :class="
                            entry.kind === 'control'
                                ? 'text-indigo-600'
                                : entry.kind === 'event'
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                        "
                        >{{ entry.name }}</span
                    >
                    <span class="truncate text-slate-600">{{ entry.detail }}</span>
                </li>
                <li v-if="log.length === 0" class="px-2 py-4 text-center text-slate-400">
                    Waiting for events…
                </li>
            </ul>
        </div>
    </section>
</template>
