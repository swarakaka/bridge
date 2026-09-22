<script setup lang="ts">
import { BridgeHead, BridgeLink, useForm } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'

defineOptions({ layout: AppLayout })
defineProps<{
    tokens: Array<{
        id: number
        name: string
        last_used_at: string | null
        created_at: string | null
    }>
    plainTextToken: string | null
}>()

const form = useForm({ name: 'mobile-demo' })
</script>

<template>
    <BridgeHead title="API tokens · Bridge" />
    <h1 class="text-2xl font-semibold">API tokens</h1>
    <p class="mt-1 text-sm text-slate-500">
        Sanctum personal access tokens. Use one as <code>Authorization: Bearer …</code> against the
        same routes; the JSON demo page can use it too.
    </p>

    <div
        v-if="plainTextToken"
        class="mt-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm"
        data-testid="plain-token"
    >
        <div class="font-medium">Your new token (shown once):</div>
        <code class="block break-all">{{ plainTextToken }}</code>
    </div>

    <form
        class="mt-6 flex items-end gap-2"
        data-testid="token-form"
        @submit.prevent="form.post('/tokens', { resetOnSuccess: true })"
    >
        <div>
            <label for="name" class="block text-sm font-medium">Token name</label>
            <input
                id="name"
                v-model="form.data.name"
                name="name"
                class="mt-1 rounded border border-slate-300 px-3 py-2"
            />
            <p v-if="form.errors.name" class="text-sm text-rose-600">{{ form.errors.name }}</p>
        </div>
        <button
            type="submit"
            class="rounded bg-indigo-600 px-3 py-2 text-sm text-white"
            :disabled="form.processing"
        >
            Create token
        </button>
    </form>

    <table class="mt-6 w-full text-sm" data-testid="tokens-table">
        <thead class="text-left text-xs uppercase text-slate-500">
            <tr>
                <th class="py-2">Name</th>
                <th>Created</th>
                <th>Last used</th>
                <th />
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">
            <tr v-for="token in tokens" :key="token.id">
                <td class="py-2">{{ token.name }}</td>
                <td>{{ token.created_at }}</td>
                <td>{{ token.last_used_at ?? 'never' }}</td>
                <td class="text-right">
                    <BridgeLink
                        :href="`/tokens/${token.id}`"
                        method="delete"
                        as="button"
                        class="text-rose-600 hover:underline"
                        >Revoke</BridgeLink
                    >
                </td>
            </tr>
            <tr v-if="tokens.length === 0">
                <td colspan="4" class="py-4 text-center text-slate-400">No tokens yet.</td>
            </tr>
        </tbody>
    </table>
</template>
