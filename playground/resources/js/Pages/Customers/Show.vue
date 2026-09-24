<script setup lang="ts">
import { BridgeHead, BridgeLink, router, WhenVisible } from '@swarakaka/bridge-vue'
import { ref } from 'vue'
import AppLayout from '@/Layouts/AppLayout.vue'
import type { Customer } from '@/types'

defineOptions({ layout: AppLayout })
const props = defineProps<{
    customer: Customer
    // A lazy prop: absent until <WhenVisible> below loads it.
    activity?: Array<{ at: string | null; text: string }>
}>()

// Optimistic: the star flips at once and flips back if the server refuses (locked customers).
const starError = ref<string | null>(null)
const toggleStar = (): void => {
    starError.value = null
    void router
        .optimistic((current) => ({
            customer: { ...(current.customer as Customer), starred: !props.customer.starred },
        }))
        .post(
            `/customers/${props.customer.id}/star`,
            {},
            {
                preserveState: true,
                preserveScroll: true,
                onInvalid: (errors) => (starError.value = errors.starred?.[0] ?? null),
            },
        )
}

const destroy = (): void => {
    if (!window.confirm(`Delete ${props.customer.name}?`)) return
    void router.delete(`/customers/${props.customer.id}`)
}
</script>

<template>
    <BridgeHead :title="`${customer.name} · Bridge`" />
    <div class="flex items-start justify-between">
        <div class="flex items-center gap-4">
            <img
                v-if="customer.avatar_url"
                :src="customer.avatar_url"
                alt=""
                class="h-16 w-16 rounded-full object-cover"
                data-testid="avatar"
            />
            <div>
                <h1 class="text-2xl font-semibold" data-testid="customer-name">
                    {{ customer.name }}
                </h1>
                <p class="text-slate-500">{{ customer.email }} · {{ customer.company ?? '—' }}</p>
                <p v-if="customer.locked" class="mt-1 text-sm text-amber-600" data-testid="locked">
                    Locked: editing and deleting return 403 in every mode.
                </p>
                <p v-if="starError" class="mt-1 text-sm text-rose-600" data-testid="star-error">
                    {{ starError }}
                </p>
            </div>
        </div>
        <div class="flex gap-2 text-sm">
            <button
                class="rounded border border-amber-300 px-3 py-1 text-amber-700"
                :aria-pressed="customer.starred"
                data-testid="star"
                @click="toggleStar"
            >
                {{ customer.starred ? '★ Starred' : '☆ Star' }}
            </button>
            <BridgeLink
                :href="`/customers/${customer.id}/edit`"
                class="rounded border border-slate-300 px-3 py-1"
                data-testid="edit"
                >Edit</BridgeLink
            >
            <button
                class="rounded border border-rose-300 px-3 py-1 text-rose-700"
                data-testid="delete"
                @click="destroy"
            >
                Delete
            </button>
        </div>
    </div>
    <dl class="mt-6 grid max-w-lg grid-cols-3 gap-y-2 text-sm">
        <dt class="text-slate-500">Status</dt>
        <dd class="col-span-2" data-testid="status">{{ customer.status }}</dd>
        <dt class="text-slate-500">Notes</dt>
        <dd class="col-span-2 whitespace-pre-line">{{ customer.notes || '—' }}</dd>
        <dt class="text-slate-500">Created</dt>
        <dd class="col-span-2">{{ customer.created_at }}</dd>
    </dl>
    <section class="mt-8 max-w-lg" aria-labelledby="activity-heading">
        <h2 id="activity-heading" class="text-lg font-semibold">Activity</h2>
        <WhenVisible data="activity" class="mt-2 text-sm" data-testid="activity">
            <template #fallback>
                <p class="text-slate-500" data-testid="activity-loading">Loading activity…</p>
            </template>
            <ul class="divide-y divide-slate-200">
                <li
                    v-for="(entry, index) in activity ?? []"
                    :key="index"
                    class="flex justify-between py-1"
                    data-testid="activity-entry"
                >
                    <span>{{ entry.text }}</span>
                    <span class="text-slate-500">{{ entry.at ?? '' }}</span>
                </li>
            </ul>
        </WhenVisible>
    </section>
    <p class="mt-8 text-sm">
        <BridgeLink href="/customers" class="text-indigo-600 hover:underline"
            >← Back to customers</BridgeLink
        >
    </p>
</template>
