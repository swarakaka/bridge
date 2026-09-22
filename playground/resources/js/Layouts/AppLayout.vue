<script setup lang="ts">
import { BridgeLink, useBridge, usePage } from '@swarakaka/bridge-vue'
import { computed, ref, watch } from 'vue'
import type { SharedProps } from '@/types'
import Toast from '@/Components/Toast.vue'
import StreamProvider from '@/Components/StreamProvider.vue'

const { props: page, url } = usePage<SharedProps>()
const user = computed(() => page.value.auth?.user ?? null)
const navigating = ref(false)
const bridge = useBridge()
bridge.on('start', () => (navigating.value = true))
bridge.on('finish', () => (navigating.value = false))

const flash = ref<{ message?: string; level?: string } | null>(null)
watch(
    () => page.value.flash,
    (value) => {
        if (value?.message) flash.value = { ...value }
    },
    { immediate: true },
)

const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/customers', label: 'Customers' },
    { href: '/realtime', label: 'Realtime' },
    { href: '/json', label: 'JSON demo' },
    { href: '/errors', label: 'Errors' },
]

const notifications = ref<Array<{ id: number; message: string; level: string; title: string | null }>>([])
let nextId = 1
const pushNotification = (n: { message: string; level: string; title: string | null }): void => {
  const id = nextId++
  notifications.value.push({ id, ...n })
  setTimeout(() => (notifications.value = notifications.value.filter((x) => x.id !== id)), 5000)
}

const isActive = (href: string): boolean =>
    href === '/' ? url.value === '/' : url.value.startsWith(href)
</script>

<template>
    <div class="min-h-screen bg-slate-50 text-slate-900">
        <div
            v-if="navigating"
            data-testid="progress"
            class="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-indigo-500"
        />
        <header class="border-b border-slate-200 bg-white">
            <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                <nav class="flex items-center gap-4">
                    <BridgeLink
                        href="/"
                        class="text-lg font-semibold tracking-tight text-indigo-600"
                        >Bridge</BridgeLink
                    >
                    <BridgeLink
                        v-for="link in links"
                        :key="link.href"
                        :href="link.href"
                        class="rounded px-2 py-1 text-sm hover:bg-slate-100"
                        :class="{ 'bg-slate-100 font-medium': isActive(link.href) }"
                    >
                        {{ link.label }}
                    </BridgeLink>
                </nav>
                <div class="flex items-center gap-3 text-sm">
                    <template v-if="user">
                        <BridgeLink href="/tokens" class="rounded px-2 py-1 hover:bg-slate-100"
                            >Tokens</BridgeLink
                        >
                        <span class="text-slate-500" data-testid="user-name">{{ user.name }}</span>
                        <BridgeLink
                            href="/logout"
                            method="post"
                            as="button"
                            class="rounded bg-slate-800 px-3 py-1 text-white"
                        >
                            Sign out
                        </BridgeLink>
                    </template>
                    <BridgeLink
                        v-else
                        href="/login"
                        class="rounded bg-indigo-600 px-3 py-1 text-white"
                        >Sign in</BridgeLink
                    >
                </div>
            </div>
        </header>

        <main class="mx-auto max-w-5xl px-4 py-8">
          <!-- One SSE connection per signed-in user, shared by every page. -->
          <StreamProvider v-if="user" :key="user.id" @notification="pushNotification">
            <slot />
          </StreamProvider>
          <slot v-else />
        </main>

        <div class="fixed right-4 top-16 z-50 space-y-2" data-testid="notifications">
          <div
            v-for="n in notifications"
            :key="n.id"
            class="w-72 rounded border border-slate-200 bg-white p-3 text-sm shadow-lg"
            :data-level="n.level"
            data-testid="notification"
          >
            <div v-if="n.title" class="text-xs font-medium uppercase text-slate-500">{{ n.title }}</div>
            <div>{{ n.message }}</div>
          </div>
        </div>

        <Toast
            v-if="flash"
            :message="flash.message ?? ''"
            :level="flash.level ?? 'success'"
            @close="flash = null"
        />
    </div>
</template>
