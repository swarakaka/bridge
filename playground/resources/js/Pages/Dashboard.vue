<script setup lang="ts">
import { BridgeHead, BridgeLink, Deferred, useDeferred, usePoll } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'
import type { Customer } from '@/types'

defineOptions({ layout: AppLayout })

defineProps<{
    recentCustomers: Customer[]
    serverTime: string
    stats?: { customers: number; active: number; inactive: number }
    signups?: Array<{ day: string; count: number }>
}>()

const { loading: statsLoading } = useDeferred('stats')

// Polling: reload only `serverTime` every 3 s while this page is shown (paused in hidden tabs).
// For data that changes on the server, a stream pushes updates instead; see the Realtime page.
usePoll(3000, { only: ['serverTime'] })
</script>

<template>
    <BridgeHead title="Dashboard · Bridge" />
    <h1 class="text-2xl font-semibold">Dashboard</h1>
    <p class="mt-1 text-sm text-slate-500">
        Shared props, a deferred <code>stats</code> group and a deferred <code>charts</code> group
        loaded after first render.
    </p>
    <p class="mt-2 text-sm text-slate-500">
        Server time
        <time class="font-mono text-slate-700" data-testid="server-time">{{ serverTime }}</time
        >, polled every 3 s.
    </p>

    <section
        class="mt-6 grid gap-4 sm:grid-cols-3"
        data-testid="stats"
        :data-loading="statsLoading"
    >
        <Deferred data="stats">
            <template #fallback>
                <div
                    v-for="i in 3"
                    :key="i"
                    class="h-20 animate-pulse rounded bg-slate-200"
                    data-testid="stats-skeleton"
                />
            </template>
            <div
                v-for="(value, key) in stats"
                :key="key"
                class="rounded border border-slate-200 bg-white p-4"
            >
                <div class="text-xs uppercase text-slate-500">{{ key }}</div>
                <div class="text-2xl font-semibold" :data-testid="`stat-${key}`">{{ value }}</div>
            </div>
        </Deferred>
    </section>

    <section class="mt-8 grid gap-6 md:grid-cols-2">
        <div>
            <h2 class="font-medium">Recent customers</h2>
            <ul
                class="mt-2 divide-y divide-slate-200 rounded border border-slate-200 bg-white"
                data-testid="recent"
            >
                <li
                    v-for="customer in recentCustomers"
                    :key="customer.id"
                    class="px-3 py-2 text-sm"
                >
                    <BridgeLink
                        :href="`/customers/${customer.id}`"
                        class="text-indigo-600 hover:underline"
                        >{{ customer.name }}</BridgeLink
                    >
                    <span class="text-slate-400"> · {{ customer.email }}</span>
                </li>
            </ul>
        </div>
        <div>
            <h2 class="font-medium">Signups per day</h2>
            <Deferred data="signups">
                <template #fallback
                    ><div class="mt-2 h-32 animate-pulse rounded bg-slate-200"
                /></template>
                <ul class="mt-2 flex h-32 items-end gap-1" data-testid="signups">
                    <li
                        v-for="point in signups"
                        :key="point.day"
                        :title="`${point.day}: ${point.count}`"
                        class="flex-1 rounded-t bg-indigo-400"
                        :style="{ height: `${Math.min(100, point.count * 10)}%` }"
                    />
                </ul>
            </Deferred>
        </div>
    </section>
</template>
