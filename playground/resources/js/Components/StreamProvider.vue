<script setup lang="ts">
import { provideAppStream } from '@/composables/useAppStream'

const emit = defineEmits<{ notification: [payload: { message: string; level: string; title: string | null }] }>()

const stream = provideAppStream()
stream.on('notification', (n) => emit('notification', { message: n.message, level: n.level, title: n.title ?? null }))
</script>

<template>
  <slot />
</template>
