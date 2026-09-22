<script setup lang="ts">
import { BridgeHead, BridgeLink, Deferred, router } from '@swarakaka/bridge-vue'
import { ref, watch } from 'vue'
import AppLayout from '@/Layouts/AppLayout.vue'
import Pagination from '@/Components/Pagination.vue'
import type { Customer, Paginated } from '@/types'

defineOptions({ layout: AppLayout })

const props = defineProps<{
    customers: Paginated<Customer>
    filters: { search: string | null }
    stats?: { total: number; active: number }
}>()

const search = ref(props.filters.search ?? '')
let timer: ReturnType<typeof setTimeout> | null = null

// Partial reload: only the `customers` prop is re-fetched; state and scroll are preserved.
watch(search, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
        void router.get('/customers', value ? { search: value } : {}, {
            only: ['customers', 'filters'],
            preserveState: true,
            preserveScroll: true,
            replace: true,
        })
    }, 250)
})
</script>

<template>
    <BridgeHead title="Customers · Bridge" />
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-semibold">Customers</h1>
            <Deferred data="stats">
                <template #fallback><p class="text-sm text-slate-400">Loading stats…</p></template>
                <p class="text-sm text-slate-500" data-testid="customer-stats">
                    {{ stats?.total }} total · {{ stats?.active }} active
                </p>
            </Deferred>
        </div>
        <BridgeLink
            href="/customers/create"
            class="rounded bg-indigo-600 px-3 py-2 text-sm text-white"
            data-testid="new-customer"
        >
            New customer
        </BridgeLink>
    </div>

    <input
        v-model="search"
        type="search"
        placeholder="Search name, email or company"
        class="mt-4 w-full rounded border border-slate-300 px-3 py-2"
        data-testid="search"
    />

    <table class="mt-4 w-full text-sm" data-testid="customers-table">
        <thead class="text-left text-xs uppercase text-slate-500">
            <tr>
                <th class="py-2">Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">
            <tr v-for="customer in customers.data" :key="customer.id" data-testid="customer-row">
                <td class="py-2">
                    <BridgeLink
                        :href="`/customers/${customer.id}`"
                        class="text-indigo-600 hover:underline"
                        prefetch="hover"
                    >
                        {{ customer.name }}
                    </BridgeLink>
                    <span v-if="customer.locked" class="ml-1 text-xs text-amber-600" title="Locked"
                        >🔒</span
                    >
                </td>
                <td>{{ customer.email }}</td>
                <td>{{ customer.company }}</td>
                <td>
                    <span
                        class="rounded px-2 py-0.5 text-xs"
                        :class="
                            customer.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-600'
                        "
                    >
                        {{ customer.status }}
                    </span>
                </td>
            </tr>
            <tr v-if="customers.data.length === 0">
                <td colspan="4" class="py-6 text-center text-slate-400" data-testid="empty">
                    No customers match.
                </td>
            </tr>
        </tbody>
    </table>

    <div class="mt-4">
        <Pagination :meta="customers.meta" :only="['customers']" />
    </div>
</template>
