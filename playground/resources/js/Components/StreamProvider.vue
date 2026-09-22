<script setup lang="ts">
import { watch } from 'vue'
import { provideAppStream } from '@/composables/useAppStream'

const emit = defineEmits<{
    notification: [payload: { message: string; level: string; title: string | null }]
}>()

const stream = provideAppStream()
stream.on('notification', (n) =>
    emit('notification', { message: n.message, level: n.level, title: n.title ?? null }),
)

// Mirror the connection state on <html> for tests and debugging (client only).
watch(
    stream.state,
    (state) => {
        if (typeof document !== 'undefined') document.documentElement.dataset.bridgeStream = state
    },
    { immediate: true },
)
</script>

<template>
    <slot />
</template>
