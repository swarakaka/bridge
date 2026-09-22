<script setup lang="ts">
import { BridgeHead, BridgeLink } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'

defineOptions({ layout: AppLayout })

const cases = [
    {
        status: 401,
        note: 'Unauthenticated: page mode navigates to the login page; JSON gets {message}.',
    },
    { status: 403, note: 'Forbidden: rendered in place by the resolved error page.' },
    { status: 404, note: 'Not found: rendered in place.' },
    { status: 419, note: 'CSRF mismatch: the client performs a full reload to refresh the token.' },
    { status: 500, note: 'Server error: rendered in place; no stack trace in page mode.' },
]
</script>

<template>
    <BridgeHead title="Errors · Bridge" />
    <h1 class="text-2xl font-semibold">Errors in every mode</h1>
    <p class="mt-1 text-sm text-slate-500">
        Each link triggers the error on the server. Open the same URL with
        <code>Accept: application/json</code> (JSON demo page) to see the Laravel-native body.
    </p>
    <ul class="mt-6 space-y-2 text-sm">
        <li v-for="c in cases" :key="c.status" class="rounded border border-slate-200 bg-white p-3">
            <BridgeLink
                :href="`/errors/${c.status}`"
                class="font-medium text-indigo-600 hover:underline"
                :data-testid="`trigger-${c.status}`"
                :prefetch="false"
            >
                Trigger {{ c.status }}
            </BridgeLink>
            <span class="ml-2 text-slate-500">{{ c.note }}</span>
        </li>
    </ul>
</template>
