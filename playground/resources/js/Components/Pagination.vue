<script setup lang="ts">
import { BridgeLink } from '@swarakaka/bridge-vue'
import type { Paginated } from '@/types'

defineProps<{ meta: Paginated<unknown>['meta']; only?: string[] }>()
</script>

<template>
    <nav
        v-if="meta.last_page > 1"
        class="flex items-center gap-1 text-sm"
        aria-label="Pagination"
        data-testid="pagination"
    >
        <template v-for="link in meta.links" :key="link.label">
            <BridgeLink
                v-if="link.url"
                :href="link.url"
                :only="only ?? []"
                preserve-state
                preserve-scroll
                class="rounded border px-2 py-1"
                :class="
                    link.active
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 hover:bg-slate-100'
                "
            >
                <span v-html="link.label" />
            </BridgeLink>
            <span v-else class="px-2 py-1 text-slate-400" v-html="link.label" />
        </template>
        <span class="ml-2 text-slate-500">{{ meta.from }}–{{ meta.to }} of {{ meta.total }}</span>
    </nav>
</template>
