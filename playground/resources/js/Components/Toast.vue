<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{ message: string; level: string }>()
const emit = defineEmits<{ close: [] }>()

let timer: ReturnType<typeof setTimeout> | null = null
onMounted(() => (timer = setTimeout(() => emit('close'), 4000)))
onBeforeUnmount(() => timer && clearTimeout(timer))

const colors: Record<string, string> = {
    success: 'bg-emerald-600',
    info: 'bg-sky-600',
    warning: 'bg-amber-600',
    error: 'bg-rose-600',
}
</script>

<template>
    <div
        role="status"
        data-testid="toast"
        :data-level="props.level"
        class="fixed right-4 bottom-4 z-50 rounded px-4 py-2 text-sm text-white shadow-lg"
        :class="colors[props.level] ?? colors.info"
    >
        {{ props.message }}
        <button
            class="ml-3 opacity-70 hover:opacity-100"
            @click="emit('close')"
            aria-label="Dismiss"
        >
            ×
        </button>
    </div>
</template>
