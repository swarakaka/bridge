<script setup lang="ts">
import { BridgeForm, BridgeHead } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'

defineOptions({ layout: AppLayout })
defineProps<{ hint: { email: string; password: string } }>()
</script>

<template>
    <BridgeHead title="Sign in · Bridge" />
    <div class="mx-auto max-w-sm">
        <h1 class="text-2xl font-semibold">Sign in</h1>
        <p class="mt-1 text-sm text-slate-500">
            Seeded user: {{ hint.email }} / {{ hint.password }}
        </p>
        <!-- Plain inputs: <BridgeForm> reads them by name; the password is cleared after a failed attempt. -->
        <BridgeForm
            v-slot="form"
            action="/login"
            class="mt-6 space-y-4"
            data-testid="login-form"
            :reset-on-error="['password']"
            disable-while-processing
        >
            <div>
                <label for="email" class="block text-sm font-medium">Email</label>
                <input
                    id="email"
                    :value="hint.email"
                    name="email"
                    type="email"
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
                <p
                    v-if="form.errors.email"
                    class="mt-1 text-sm text-rose-600"
                    data-testid="error-email"
                >
                    {{ form.errors.email }}
                </p>
            </div>
            <div>
                <label for="password" class="block text-sm font-medium">Password</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
                <p
                    v-if="form.errors.password"
                    class="mt-1 text-sm text-rose-600"
                    data-testid="error-password"
                >
                    {{ form.errors.password }}
                </p>
            </div>
            <label class="flex items-center gap-2 text-sm"
                ><input type="checkbox" name="remember" value="1" /> Remember me</label
            >
            <button
                type="submit"
                class="w-full rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
                :disabled="form.processing"
                data-testid="submit"
            >
                Sign in
            </button>
        </BridgeForm>
    </div>
</template>
