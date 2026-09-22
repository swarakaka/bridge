<script setup lang="ts">
import { BridgeLink } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'

defineOptions({ layout: AppLayout })
const props = defineProps<{ status: number; kind: string; message: string }>()

const titles: Record<number, string> = {
    403: 'Forbidden',
    404: 'Page not found',
    419: 'Page expired',
    429: 'Too many requests',
    500: 'Server error',
    503: 'Service unavailable',
}
const title = titles[props.status] ?? `Error ${props.status}`
</script>

<template>
    <div class="mx-auto max-w-lg py-16 text-center" data-testid="error-page" :data-status="status">
        <div class="text-6xl font-bold text-slate-300">{{ status }}</div>
        <h1 class="mt-2 text-2xl font-semibold">{{ title }}</h1>
        <p class="mt-2 text-slate-500" data-testid="error-message">{{ message }}</p>
        <p class="mt-6 text-sm">
            <BridgeLink href="/" class="text-indigo-600 hover:underline"
                >Back to the dashboard</BridgeLink
            >
        </p>
    </div>
</template>
