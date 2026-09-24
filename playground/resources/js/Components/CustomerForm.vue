<script setup lang="ts">
import { useForm } from '@swarakaka/bridge-vue'
import type { Customer } from '@/types'

const props = defineProps<{
    customer?: Partial<Customer> | null
    statuses: string[]
    submitLabel: string
    action: string
    method: 'post' | 'put'
}>()

const form = useForm({
    name: props.customer?.name ?? '',
    email: props.customer?.email ?? '',
    company: props.customer?.company ?? '',
    status: props.customer?.status ?? 'active',
    notes: props.customer?.notes ?? '',
    avatar: null as File | null,
})

const onFile = (event: Event): void => {
    const input = event.target as HTMLInputElement
    form.avatar = input.files?.[0] ?? null
}

const submit = (): void => {
    void form.submit(props.method, props.action, { preserveScroll: true })
}

// Live validation of one field through Laravel Precognition (route has the `precognitive` middleware).
const validateField = (field: string): void => {
    void form.validate(props.method, props.action, field)
}
</script>

<template>
    <form class="space-y-4" data-testid="customer-form" @submit.prevent="submit">
        <div v-for="field in ['name', 'email', 'company'] as const" :key="field">
            <label :for="field" class="block text-sm font-medium capitalize">{{ field }}</label>
            <input
                :id="field"
                v-model="form[field]"
                :name="field"
                type="text"
                @blur="validateField(field)"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                :aria-invalid="Boolean(form.errors[field])"
            />
            <p
                v-if="form.errors[field]"
                class="mt-1 text-sm text-rose-600"
                :data-testid="`error-${field}`"
            >
                {{ form.errors[field] }}
            </p>
        </div>

        <div>
            <label for="status" class="block text-sm font-medium">Status</label>
            <select
                id="status"
                v-model="form.status"
                name="status"
                class="mt-1 rounded border border-slate-300 px-3 py-2"
            >
                <option v-for="status in statuses" :key="status" :value="status">
                    {{ status }}
                </option>
            </select>
        </div>

        <div>
            <label for="notes" class="block text-sm font-medium">Notes</label>
            <textarea
                id="notes"
                v-model="form.notes"
                name="notes"
                rows="3"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
        </div>

        <div>
            <label for="avatar" class="block text-sm font-medium"
                >Avatar (upload with progress)</label
            >
            <input
                id="avatar"
                name="avatar"
                type="file"
                accept="image/*"
                class="mt-1 block text-sm"
                @change="onFile"
            />
            <p
                v-if="form.errors.avatar"
                class="mt-1 text-sm text-rose-600"
                data-testid="error-avatar"
            >
                {{ form.errors.avatar }}
            </p>
            <div
                v-if="form.progress"
                class="mt-2 h-2 w-full rounded bg-slate-200"
                data-testid="upload-progress"
            >
                <div
                    class="h-2 rounded bg-indigo-500"
                    :style="{ width: `${form.progress.percentage}%` }"
                />
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button
                type="submit"
                class="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
                :disabled="form.processing"
                data-testid="submit"
            >
                {{ form.processing ? 'Saving…' : submitLabel }}
            </button>
            <span v-if="form.recentlySuccessful" class="text-sm text-emerald-600">Saved.</span>
            <span v-if="form.isDirty" class="text-xs text-slate-400" data-testid="dirty"
                >Unsaved changes</span
            >
        </div>
    </form>
</template>
